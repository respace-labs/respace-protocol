// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Token.sol";
import "./Events.sol";
import "./Constants.sol";
import "hardhat/console.sol";

library Member {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.Bytes32Set;

  struct State {
    uint8 planIndex;
    uint256 subscriptionIndex;
    uint256 subscriptionIncome;
    mapping(uint8 => Plan) plans;
    mapping(bytes32 => Subscription) subscriptions;
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

  /* Plan */
  function createPlan(State storage self, string memory uri, uint256 price) external returns (uint8) {
    self.plans[self.planIndex] = Plan(uri, price, true);
    self.planIndex++;
    return self.planIndex - 1;
  }

  function updatePlan(State storage self, uint8 id, string memory uri, uint256 price, bool isActive) external {
    require(id < self.planIndex, "Plan is not existed");
    self.plans[id].uri = uri;
    self.plans[id].price = price;
    self.plans[id].isActive = isActive;
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
    EnumerableSet.Bytes32Set storage subscriptionIds,
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
      subscriptionIds.add(id);
    }

    (consumedAmount, remainDuration) = distributeSingleSubscription(self, id);

    subscription.startTime = block.timestamp;
    subscription.amount += amount;
    subscription.duration += durationFromAmount;
  }

  function unsubscribe(
    State storage self,
    EnumerableSet.Bytes32Set storage subscriptionIds,
    uint8 planId,
    uint256 amount
  ) external returns (uint256 subscriptionFee, uint256 unsubscribeAmount, uint256 unsubscribedDuration) {
    bytes32 id = keccak256(abi.encode(planId, msg.sender));
    Subscription storage subscription = self.subscriptions[id];
    require(subscription.startTime > 0, "Subscription not found");
    require(amount > 0, "Amount must be greater than zero");

    (subscriptionFee, ) = distributeSingleSubscription(self, id);

    // Unsubscribe all;
    if (amount >= subscription.amount) {
      IERC20(address(this)).transfer(msg.sender, subscription.amount);
      delete self.subscriptions[id];
      subscriptionIds.remove(id);

      unsubscribeAmount = subscription.amount;
      unsubscribedDuration = subscription.duration;
    } else {
      unsubscribedDuration = (subscription.duration * amount) / subscription.amount;
      subscription.amount -= amount;
      subscription.duration -= unsubscribedDuration;

      IERC20(address(this)).transfer(msg.sender, amount);
      unsubscribeAmount = amount;
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

  function getSubscriptions(
    State storage self,
    EnumerableSet.Bytes32Set storage subscriptionIds
  ) external view returns (Subscription[] memory) {
    bytes32[] memory ids = subscriptionIds.values();
    uint256 len = ids.length;
    Subscription[] memory subscriptions = new Subscription[](len);

    for (uint256 i = 0; i < len; i++) {
      subscriptions[i] = self.subscriptions[ids[i]];
    }
    return subscriptions;
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

  function getTokenPricePerSecond(
    State storage self,
    Token.State memory token,
    uint8 planId
  ) internal view returns (uint256) {
    Member.Plan memory plan = self.plans[planId];
    uint256 ethPricePerSecond = plan.price / SECONDS_PER_MONTH;
    BuyInfo memory info = Token.getTokenAmount(token, ethPricePerSecond);
    return info.tokenAmountAfterFee;
  }
}
