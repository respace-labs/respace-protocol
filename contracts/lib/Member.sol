// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Token.sol";
import "./Curation.sol";
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
    uint256 price; // Monthly price in wei
    uint256 minEthAmount; // Minimum subscription amount in wei
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
  function createPlan(
    State storage self,
    string calldata uri,
    uint256 price,
    uint256 minEthAmount
  ) external returns (uint8) {
    require(price > 0, "Price must be greater than zero");
    self.plans[self.planIndex] = Plan(uri, price, minEthAmount, true);
    self.planIndex++;
    return self.planIndex - 1;
  }

  function updatePlan(
    State storage self,
    uint8 id,
    string calldata uri,
    uint256 price,
    uint256 minEthAmount,
    bool isActive
  ) external {
    require(price > 0, "Price must be greater than zero");
    require(id < self.planIndex, "Plan is not existed");
    self.plans[id].uri = uri;
    self.plans[id].price = price;
    self.plans[id].minEthAmount = minEthAmount;
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
    Curation.State storage curation,
    EnumerableSet.Bytes32Set storage subscriptionIds,
    uint8 planId,
    uint256 ethAmount,
    uint256 tokenAmount
  ) external returns (uint256 increasingDuration, uint256 consumedAmount, uint256 remainingDuration) {
    require(planId < self.planIndex, "Plan is not existed");
    require(ethAmount > 0, "ETH amount must be greater than zero");

    Member.Plan memory plan = self.plans[planId];
    require(plan.isActive, "Plan is not active");
    require(ethAmount >= plan.minEthAmount, "ETH amount is less than minimum amount");

    bytes32 id = generateSubscriptionId(planId, msg.sender);
    Subscription storage subscription = self.subscriptions[id];

    // Calculate the subscription duration
    increasingDuration = (ethAmount * SECONDS_PER_MONTH) / plan.price;

    // Initialize subscription if it does not exist
    if (subscription.startTime == 0) {
      subscription.planId = planId;
      subscription.account = msg.sender;
      subscriptionIds.add(id);
      remainingDuration = increasingDuration;

      Curation.increaseMemberCount(curation, msg.sender);
    } else {
      // Calculate consumed amount and remaining duration
      (consumedAmount, remainingDuration) = distributeSingleSubscription(self, curation, subscriptionIds, id);
    }

    // Update subscription details
    subscription.startTime = block.timestamp;
    subscription.amount += tokenAmount;
    subscription.duration += increasingDuration;
  }

  function unsubscribe(
    State storage self,
    Curation.State storage curation,
    EnumerableSet.Bytes32Set storage subscriptionIds,
    uint8 planId,
    uint256 amount
  )
    external
    returns (uint256 consumedAmount, uint256 unsubscribeAmount, uint256 unsubscribedDuration, uint256 remainingDuration)
  {
    require(amount > 0, "Amount must be greater than zero");

    bytes32 id = generateSubscriptionId(planId, msg.sender);
    Subscription storage subscription = self.subscriptions[id];
    require(subscription.startTime > 0, "Subscription not found");

    (consumedAmount, remainingDuration) = distributeSingleSubscription(self, curation, subscriptionIds, id);

    // Calculate the amount to transfer
    uint256 transferAmount = amount >= subscription.amount ? subscription.amount : amount;
    IERC20(address(this)).transfer(msg.sender, transferAmount);

    if (amount >= subscription.amount) {
      // Unsubscribe completely
      delete self.subscriptions[id];
      subscriptionIds.remove(id);
      unsubscribeAmount = subscription.amount;
      unsubscribedDuration = subscription.duration;
    } else {
      // Partially unsubscribe
      unsubscribedDuration = (subscription.duration * amount) / subscription.amount;
      subscription.amount -= amount;
      subscription.duration -= unsubscribedDuration;
      unsubscribeAmount = amount;
    }
  }

  function distributeSingleSubscription(
    State storage self,
    Curation.State storage curation,
    EnumerableSet.Bytes32Set storage subscriptionIds,
    bytes32 id
  ) public returns (uint256, uint256) {
    Subscription storage subscription = self.subscriptions[id];
    if (subscription.startTime == 0) return (0, 0);

    (uint256 consumedAmount, uint256 remainingDuration) = calculateConsumedAmount(self, id, block.timestamp);

    if (consumedAmount == 0) return (0, 0);

    /** expired */
    if (subscription.startTime + subscription.duration <= block.timestamp) {
      Curation.decreaseMemberCount(curation, subscription.account);
      delete self.subscriptions[id];
      subscriptionIds.remove(id);
    } else {
      subscription.startTime = block.timestamp;
      subscription.amount -= consumedAmount;
      subscription.duration = remainingDuration;
    }

    return (consumedAmount, remainingDuration);
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

    if (subscription.startTime == 0) return (0, 0);

    /** Invalid timestamp */
    if (timestamp < subscription.startTime) return (0, 0);

    uint256 pastDuration = timestamp - subscription.startTime;

    /** Expired, all should be consumed */
    if (pastDuration >= subscription.duration) {
      return (subscription.amount, 0);
    }

    uint256 remainingDuration = subscription.duration - pastDuration;

    // calculate consumedAmount by ratio of (pastDuration/duration)
    uint256 consumedAmount = (subscription.amount * pastDuration) / subscription.duration;
    return (consumedAmount, remainingDuration);
  }

  function generateSubscriptionId(uint8 planId, address account) public pure returns (bytes32) {
    return keccak256(abi.encode(planId, account));
  }
}
