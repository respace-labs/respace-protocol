// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "hardhat/console.sol";

library Member {
  using SafeERC20 for IERC20;
  using Math for uint256;
  using EnumerableSet for EnumerableSet.AddressSet;
  using EnumerableSet for EnumerableSet.Bytes32Set;

  uint256 constant SECONDS_PER_MONTH = 24 * 60 * 60 * 30; // 30 days
  uint256 public constant DEFAULT_SUBSCRIPTION_PRICE = 0.002048 * 1 ether; // per month

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
    uint256 startTime;
    uint256 duration;
    uint256 amount; // total amount
  }

  event Subscribed(uint8 indexed planId, address indexed user, uint256 duration, uint256 tokenAmount);
  event Unsubscribed(uint8 indexed planId, address indexed user, uint256 amount);
  event PlanCreated(uint8 indexed id, string uri, uint256 price);

  /* Plan */
  function createPlan(State storage self, string memory uri, uint256 price) external {
    self.plans[self.planIndex] = Plan(uri, price, true);
    emit PlanCreated(self.planIndex, uri, price);
    self.planIndex++;
  }

  function setPlanURI(State storage self, uint8 id, string memory uri) external {
    require(id < self.planIndex, "Plan is not existed");
    self.plans[id].uri = uri;
  }

  function setPlanPrice(State storage self, uint8 id, uint256 price) external {
    require(id < self.planIndex, "Plan is not existed");
    self.plans[id].price = price;
  }

  function setPlanStatus(State storage self, uint8 id, bool isActive) external {
    require(id < self.planIndex, "Plan is not existed");
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

  /* ====== Subscription ======= */

  function subscribe(
    State storage self,
    uint8 planId,
    uint256 amount,
    uint256 durationFromAmount,
    bool needTransfer
  ) external returns (uint256 consumedAmount, uint256 remainDuration) {
    bytes32 id = keccak256(abi.encode(planId, msg.sender));
    Subscription storage subscription = self.subscriptions[id];

    if (needTransfer) {
      IERC20(address(this)).safeTransferFrom(msg.sender, address(this), amount);
    }

    // new subscription
    if (subscription.startTime == 0) {
      subscription.planId = planId;
      subscription.account = msg.sender;
      self.subscriptionIds.add(id);
    }

    (consumedAmount, remainDuration) = distributeSingleSubscription(self, id);

    subscription.startTime = block.timestamp;
    subscription.amount += amount;
    subscription.duration += durationFromAmount;

    emit Subscribed(planId, msg.sender, durationFromAmount, amount);
  }

  function unsubscribe(State storage self, uint8 planId, uint256 amount) external returns (uint256 subscriptionFee) {
    bytes32 id = keccak256(abi.encode(planId, msg.sender));
    Subscription storage subscription = self.subscriptions[id];
    require(subscription.startTime > 0, "Subscription not found");
    require(amount > 0, "Amount must be greater than zero");

    (subscriptionFee, ) = distributeSingleSubscription(self, id);

    // Unsubscribe all;
    if (amount >= subscription.amount) {
      IERC20(address(this)).transfer(msg.sender, subscription.amount);
      delete self.subscriptions[id];
      self.subscriptionIds.remove(id);

      emit Unsubscribed(planId, msg.sender, subscription.amount);
    } else {
      uint256 unsubscribedDuration = (subscription.duration * amount) / subscription.amount;
      subscription.amount -= amount;
      subscription.duration -= unsubscribedDuration;

      IERC20(address(this)).transfer(msg.sender, amount);

      emit Unsubscribed(planId, msg.sender, amount);
    }
  }

  function distributeSingleSubscription(State storage self, bytes32 id) public returns (uint256, uint256) {
    Subscription storage subscription = self.subscriptions[id];
    if (subscription.startTime == 0) return (0, 0);

    (uint256 consumedAmount, uint256 remainDuration) = calculateConsumedAmount(self, id, block.timestamp);

    if (consumedAmount == 0) return (0, 0);

    subscription.startTime = block.timestamp;
    subscription.amount -= consumedAmount;
    subscription.duration = remainDuration;
    // self.subscriptionIncome += consumedAmount;
    return (consumedAmount, remainDuration);
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

  function calculateConsumedAmount(
    State storage self,
    bytes32 id,
    uint256 timestamp
  ) public view returns (uint256, uint256) {
    Subscription memory subscription = self.subscriptions[id];

    /// Subscription not found
    if (subscription.startTime == 0) return (0, 0);

    /** Invalid timestamp */
    if (timestamp < subscription.startTime) return (0, 0);

    uint256 pastDuration = timestamp - subscription.startTime;

    /** Expired, all should be consumed */
    if (pastDuration >= subscription.duration) {
      return (subscription.amount, 0);
    }

    uint256 remainDuration = subscription.duration - pastDuration;

    // calculate consumedAmount by ratio of (pastDuration/duration)
    uint256 consumedAmount = (subscription.amount * pastDuration) / subscription.duration;
    return (consumedAmount, remainDuration);
  }
}
