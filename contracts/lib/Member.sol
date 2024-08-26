// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";

library Member {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.AddressSet;
  using EnumerableSet for EnumerableSet.Bytes32Set;

  uint constant SECONDS_PER_MONTH = 24 * 60 * 60 * 30; // 30 days

  uint256 public constant DEFAULT_SUBSCRIPTION_PRICE = 0.002048 * 1 ether; // per month

  struct Info {
    uint256 subscriptionIncome;
  }

  struct State {
    uint8 planIndex;
    uint256 subscriptionIndex;
    uint256 subscriptionIncome;
    mapping(uint8 => Plan) plans;
    mapping(bytes32 => Subscription) subscriptions;
    EnumerableSet.Bytes32Set subscriptionIds;
  }

  struct Plan {
    string uri;
    uint256 price; // monthly
    bool isActive;
  }

  struct Subscription {
    uint8 planId;
    address account;
    uint256 start;
    uint256 checkpoint; // time check point
    uint256 duration;
    uint256 amount; // total amount
    uint256 consumed; // consumed amount
  }

  event Subscribed(address indexed user, uint256 duration, uint256 tokenAmount);
  event Unsubscribed(address indexed user, uint256 amount);

  function getInfo(State storage self) public view returns (Info memory) {
    return Info(self.subscriptionIncome);
  }

  /* PLAN */

  function createPlan(State storage self, string memory uri, uint256 price) external {
    self.plans[self.planIndex] = Plan(uri, price, true);
    self.planIndex++;
  }

  function setPlanURI(State storage self, uint8 id, string memory uri) external {
    require(id <= self.planIndex, "Plan is not existed");
    self.plans[id].uri = uri;
  }

  function setPlanPrice(State storage self, uint8 id, uint256 price) external {
    require(id <= self.planIndex, "Plan is not existed");
    self.plans[id].price = price;
  }

  function setPlanStatus(State storage self, uint8 id, bool isActive) external {
    require(id <= self.planIndex, "Plan is not existed");
    self.plans[id].isActive = isActive;
  }

  function getPlan(State storage self, uint8 id) external view returns (Plan memory) {
    return self.plans[id];
  }

  function getPlans(State storage self) external view returns (Plan[] memory plans) {
    uint256 len = self.planIndex;
    plans = new Plan[](len);

    for (uint8 i = 0; i < len; i++) {
      plans[i] = self.plans[i];
    }
  }

  /* Subscription */

  function subscribe(
    State storage self,
    uint8 planId,
    uint256 amount,
    uint256 durationByAmount,
    bool needTransfer
  ) external {
    bytes32 id = keccak256(abi.encode(planId, msg.sender));
    Subscription storage subscription = self.subscriptions[id];

    if (needTransfer) {
      IERC20(address(this)).safeTransferFrom(msg.sender, address(this), amount);
    }

    // new subscription
    if (subscription.amount == 0) {
      subscription.start = block.timestamp;
      subscription.checkpoint = block.timestamp;
      self.subscriptionIds.add(id);
    } else {
      // Subscription is expired, reset it
      bool isExpired = block.timestamp > subscription.start + subscription.duration;
      if (isExpired) {
        self.subscriptions[id] = Subscription(planId, msg.sender, block.timestamp, 0, 0, 0, block.timestamp);
        subscription = self.subscriptions[id];
      }
    }

    distributeSingleSubscription(self, id);

    subscription.amount += amount;
    subscription.duration += durationByAmount;

    emit Subscribed(msg.sender, durationByAmount, amount);
  }

  function unsubscribe(State storage self, uint8 planId, uint256 amount) external {
    bytes32 id = keccak256(abi.encode(planId, msg.sender));
    Subscription storage subscription = self.subscriptions[id];
    if (subscription.amount == 0) return;
    require(amount > 0, "Amount must be greater than zero");
    require(amount <= subscription.amount - subscription.consumed, "Amount too large");

    distributeSingleSubscription(self, id);

    // decrease all;
    if (amount == subscription.amount - subscription.consumed) {
      uint256 unsubscribedAmount = subscription.amount - subscription.consumed;
      delete self.subscriptions[id];
      self.subscriptionIds.remove(id);
      self.subscriptionIncome += unsubscribedAmount;
      IERC20(address(this)).transfer(msg.sender, unsubscribedAmount);

      emit Unsubscribed(msg.sender, unsubscribedAmount);
      return;
    }

    uint256 remainDuration = subscription.start + subscription.duration - block.timestamp;

    uint256 remainAmount = subscription.amount - subscription.consumed;

    uint256 deltaDuration = (amount * remainDuration) / remainAmount;

    subscription.duration -= deltaDuration;
    subscription.amount -= amount;

    IERC20(address(this)).transfer(msg.sender, amount);

    // reset
    if (subscription.consumed >= subscription.amount) {
      delete self.subscriptions[id];
      self.subscriptionIds.remove(id);
    }
  }

  function distributeSubscriptionRewards(State storage self) external {
    bytes32[] memory ids = self.subscriptionIds.values();
    uint256 len = ids.length;

    for (uint256 i = 0; i < len; i++) {
      distributeSingleSubscription(self, ids[i]);
    }
  }

  function distributeSingleSubscription(State storage self, bytes32 id) public {
    Subscription storage subscription = self.subscriptions[id];
    if (subscription.start == 0) return;
    uint256 payableAmount = consumedAmount(self, id, block.timestamp);

    // console.log("=======payableAmount:", payableAmount);

    if (payableAmount == 0) return;
    subscription.checkpoint = block.timestamp;
    subscription.consumed += payableAmount;
    self.subscriptionIncome += payableAmount;
  }

  function getSubscriptions(State storage self) external view returns (Subscription[] memory) {
    bytes32[] memory ids = self.subscriptionIds.values();
    uint256 len = ids.length;
    Subscription[] memory subscriptions = new Subscription[](len);

    for (uint256 i = 0; i < len; i++) {
      subscriptions[i] = self.subscriptions[ids[i]];
    }
    return subscriptions;
  }

  function getSubscription(State storage self, uint8 planId, address user) external view returns (Subscription memory) {
    bytes32 id = keccak256(abi.encode(planId, user));
    return self.subscriptions[id];
  }

  function consumedAmount(State storage self, bytes32 id, uint256 timestamp) public view returns (uint256) {
    Subscription memory subscription = self.subscriptions[id];
    if (subscription.duration == 0) return 0;

    if (timestamp < subscription.start) {
      return 0;
    } else if (timestamp > subscription.start + subscription.duration) {
      return subscription.amount - subscription.consumed;
    } else {
      uint256 remainAmount = subscription.amount - subscription.consumed;

      uint256 remainDuration = subscription.start + subscription.duration - timestamp;
      return (remainAmount * (timestamp - subscription.checkpoint)) / remainDuration;
    }
  }
}
