// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Token.sol";
import "./Curation.sol";
import "./Events.sol";
import "./Constants.sol";

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

  /* Plan */
  function createPlan(
    State storage self,
    string calldata uri,
    uint256 price,
    uint256 minEthAmount
  ) external returns (uint8 planId) {
    if (price == 0) revert Errors.PriceIsZero();
    planId = self.planIndex;
    self.plans[planId] = Plan(uri, price, minEthAmount, true);
    ++self.planIndex;
  }

  function updatePlan(
    State storage self,
    uint8 id,
    string calldata uri,
    uint256 price,
    uint256 minEthAmount,
    bool isActive
  ) external {
    if (price == 0) revert Errors.PriceIsZero();
    if (id >= self.planIndex) revert Errors.PlanNotExisted();
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
    Token.State memory token,
    Curation.State storage curation,
    EnumerableSet.Bytes32Set storage subscriptionIds,
    uint8 planId,
    string calldata uri,
    uint256 tokenAmount
  ) external returns (uint256 increasingDuration, uint256 consumedAmount, uint256 remainingDuration) {
    if (planId >= self.planIndex) revert Errors.PlanNotExisted();
    if (tokenAmount == 0) revert Errors.EthAmountIsZero();

    Plan memory plan = self.plans[planId];
    if (!plan.isActive) revert Errors.PlanNotActive();

    uint256 minimumSubscriptionTokens = calculateMinimumSubscriptionTokens(token, plan);
    if (tokenAmount < minimumSubscriptionTokens) revert Errors.SubscribeAmountTooSmall();

    bytes32 id = generateSubscriptionId(planId, msg.sender);
    Subscription storage subscription = self.subscriptions[id];

    // Calculate the subscription duration
    increasingDuration = calculateIncreasingDuration(token, plan, tokenAmount);

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
    subscription.uri = uri;
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
    if (amount == 0) revert Errors.AmountIsZero();

    bytes32 id = generateSubscriptionId(planId, msg.sender);
    Subscription storage subscription = self.subscriptions[id];
    if (subscription.startTime == 0) revert Errors.SubscriptionNotFound();

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

  function getSubscription(
    State storage self,
    uint8 planId,
    address account
  ) external view returns (Subscription memory) {
    bytes32 id = generateSubscriptionId(planId, account);
    return self.subscriptions[id];
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

  function calculateIncreasingDuration(
    Token.State memory token,
    Plan memory plan,
    uint256 tokenAmount
  ) internal pure returns (uint256 duration) {
    uint256 ethPricePerSecond = plan.price / SECONDS_PER_MONTH;
    BuyInfo memory info = Token.getTokenAmount(token, ethPricePerSecond);
    duration = tokenAmount / info.tokenAmountAfterFee;
  }

  function calculateMinimumSubscriptionTokens(
    Token.State memory token,
    Plan memory plan
  ) internal pure returns (uint256) {
    uint256 ethPricePerSecond = plan.minEthAmount / SECONDS_PER_MONTH;
    BuyInfo memory info = Token.getTokenAmount(token, ethPricePerSecond);
    return info.tokenAmountAfterFee * SECONDS_PER_MONTH;
  }

  function generateSubscriptionId(uint8 planId, address account) public pure returns (bytes32) {
    return keccak256(abi.encode(planId, account));
  }
}
