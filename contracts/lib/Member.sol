// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";

library Member {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.AddressSet;

  uint constant SECONDS_PER_MONTH = 24 * 60 * 60 * 30; // 30 days

  uint256 public constant SUBSCRIPTION_PRICE = 0.002048 * 1 ether; // per month

  struct Info {
    uint256 subscriptionPrice;
    uint256 subscriptionIncome;
  }

  struct State {
    uint256 subscriptionPrice;
    uint256 subscriptionIncome;
    mapping(address => Subscription) subscriptions;
    EnumerableSet.AddressSet subscribers;
  }

  struct Subscription {
    uint256 start;
    uint256 checkpoint; // time check point
    uint256 duration;
    uint256 amount; // total amount
    uint256 consumed; // consumed amount
  }

  event Subscribed(address indexed user, uint256 duration, uint256 tokenAmount);
  event Unsubscribed(address indexed user, uint256 amount);

  function getInfo(State storage self) public view returns (Info memory) {
    return Info(self.subscriptionPrice, self.subscriptionIncome);
  }

  function setSubscriptionPrice(State storage self, uint256 price) external {
    self.subscriptionPrice = price;
  }

  function subscribeByToken(State storage self, uint256 amount, uint256 durationByAmount, bool needTransfer) external {
    Subscription storage subscription = self.subscriptions[msg.sender];

    if (needTransfer) {
      IERC20(address(this)).safeTransferFrom(msg.sender, address(this), amount);
    }

    // new subscription
    if (subscription.amount == 0) {
      subscription.start = block.timestamp;
      subscription.checkpoint = block.timestamp;
      self.subscribers.add(msg.sender);
    } else {
      // Subscription is expired, reset it
      bool isExpired = block.timestamp > subscription.start + subscription.duration;
      if (isExpired) {
        self.subscriptions[msg.sender] = Subscription(block.timestamp, 0, 0, 0, block.timestamp);
        subscription = self.subscriptions[msg.sender];
      }
    }

    distributeSingleSubscription(self, msg.sender);

    subscription.amount += amount;
    subscription.duration += durationByAmount;

    emit Subscribed(msg.sender, durationByAmount, amount);
  }

  function unsubscribeByToken(State storage self, uint256 amount) external {
    Subscription storage subscription = self.subscriptions[msg.sender];
    if (subscription.amount == 0) return;
    require(amount > 0, "Amount must be greater than zero");
    require(amount <= subscription.amount - subscription.consumed, "Amount too large");

    distributeSingleSubscription(self, msg.sender);

    // decrease all;
    if (amount == subscription.amount - subscription.consumed) {
      uint256 unsubscribedAmount = subscription.amount - subscription.consumed;
      delete self.subscriptions[msg.sender];
      self.subscribers.remove(msg.sender);
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
      delete self.subscriptions[msg.sender];
      self.subscribers.remove(msg.sender);
    }
  }

  function distributeSubscriptionRewards(State storage self) external {
    uint256 len = self.subscribers.length();

    for (uint256 i = 0; i < len; i++) {
      address user = self.subscribers.at(i);
      distributeSingleSubscription(self, user);
    }
  }

  function distributeSingleSubscription(State storage self, address user) public {
    Subscription storage subscription = self.subscriptions[user];
    if (subscription.start == 0) return;
    uint256 payableAmount = consumedAmount(self, user, block.timestamp);

    // console.log("=======payableAmount:", payableAmount);

    if (payableAmount == 0) return;
    subscription.checkpoint = block.timestamp;
    subscription.consumed += payableAmount;
    self.subscriptionIncome += payableAmount;
  }

  function getSubscriptions(State storage self) external view returns (Subscription[] memory) {
    uint256 len = self.subscribers.length();
    Subscription[] memory subscriptions = new Subscription[](len);

    for (uint256 i = 0; i < len; i++) {
      address user = self.subscribers.at(i);
      subscriptions[i] = self.subscriptions[user];
    }
    return subscriptions;
  }

  function getSubscription(State storage self, address subscriber) external view returns (Subscription memory) {
    return self.subscriptions[subscriber];
  }

  function consumedAmount(State storage self, address subscriber, uint256 timestamp) public view returns (uint256) {
    Subscription memory subscription = self.subscriptions[subscriber];
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
