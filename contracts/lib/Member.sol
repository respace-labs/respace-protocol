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
    uint256 subscriptionAmount;
  }

  struct State {
    uint256 subscriptionPrice;
    uint256 subscriptionAmount;
    mapping(address => Subscription) subscriptions;
    EnumerableSet.AddressSet subscribers;
  }

  struct Subscription {
    uint256 start;
    uint256 duration;
    uint256 amount; // total amount
    uint256 payed; // payed amount
    uint256 checkpoint;
  }

  event Subscribed(address indexed user, uint256 duration);
  event Unsubscribed(address indexed user);

  function getInfo(State storage self) public view returns (Info memory) {
    return Info(self.subscriptionPrice, self.subscriptionAmount);
  }

  function setSubscriptionPrice(State storage self, uint256 price) external {
    self.subscriptionPrice = price;
  }

  function increaseSubscriptionByToken(State storage self, uint256 amount, uint256 durationByAmount) external {
    Subscription storage subscription = self.subscriptions[msg.sender];
    IERC20(address(this)).safeTransferFrom(msg.sender, address(this), amount);

    // new subscription
    if (subscription.amount == 0) {
      subscription.start = block.timestamp;
      subscription.checkpoint = block.timestamp;
      // console.log("==========duration:", msg.sender, subscription.duration, subscription.start);

      // uint256 ethAmount = getEthAmount(amount);
      // uint256 ethPricePerSecond = subscriptionPrice / SECONDS_PER_MONTH;
      // uint256 duration = ethAmount / ethPricePerSecond
      // console.log("=====subscription.payed:", subscription.payed);
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
  }

  function decreaseSubscriptionByToken(State storage self, uint256 amount) external {
    Subscription storage subscription = self.subscriptions[msg.sender];
    if (subscription.amount == 0) return;
    require(amount > 0, "Amount must be greater than zero");
    require(amount <= subscription.amount - subscription.payed, "Amount too large");

    // decrease all;
    if (amount == subscription.amount - subscription.payed) {
      delete self.subscriptions[msg.sender];
      self.subscribers.remove(msg.sender);
      self.subscriptionAmount += amount;
      return;
    }

    distributeSingleSubscription(self, msg.sender);

    uint256 remainDuration = subscription.start + subscription.duration - block.timestamp;

    uint256 remainAmount = subscription.amount - subscription.payed;

    uint256 deltaDuration = (amount * remainDuration) / remainAmount;

    subscription.duration -= deltaDuration;
    subscription.amount -= amount;

    // reset
    if (subscription.payed >= subscription.amount) {
      delete self.subscriptions[msg.sender];
      self.subscribers.remove(msg.sender);
    }
  }

  function distributeSubscriptionRewards(State storage self) external {
    uint256 count = self.subscribers.length();

    for (uint256 i = 0; i < count; i++) {
      address user = self.subscribers.at(i);
      distributeSingleSubscription(self, user);
    }
  }

  function distributeSingleSubscription(State storage self, address user) public {
    Subscription storage subscription = self.subscriptions[user];
    if (subscription.start == 0) return;
    uint256 payableAmount = payedAmount(self, user, block.timestamp);

    console.log("=======payableAmount:", payableAmount);

    if (payableAmount == 0) return;
    subscription.checkpoint = block.timestamp;
    subscription.payed += payableAmount;
    self.subscriptionAmount += payableAmount;
  }

  function getSubscription(State storage self, address subscriber) external view returns (Subscription memory) {
    return self.subscriptions[subscriber];
  }

  function payedAmount(State storage self, address subscriber, uint256 timestamp) public view returns (uint256) {
    Subscription memory subscription = self.subscriptions[subscriber];
    if (subscription.duration == 0) return 0;

    if (timestamp < subscription.start) {
      return 0;
    } else if (timestamp > subscription.start + subscription.duration) {
      return subscription.amount - subscription.payed;
    } else {
      uint256 remainAmount = subscription.amount - subscription.payed;

      uint256 remainDuration = subscription.start + subscription.duration - timestamp;
      return (remainAmount * (timestamp - subscription.checkpoint)) / remainDuration;
    }
  }
}
