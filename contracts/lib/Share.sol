// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./TransferUtil.sol";
import "hardhat/console.sol";

library Share {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.UintSet;

  uint256 public constant PER_SHARE_PRECISION = 10 ** 18;
  uint256 public constant SHARES_SUPPLY = 1_000_000;

  struct Contributor {
    uint256 shares;
    uint256 rewards; // realized rewards
    uint256 checkpoint;
    bool exists;
  }

  struct ContributorInfo {
    address account;
    uint256 shares;
  }

  struct Order {
    address seller;
    uint256 amount;
    uint256 price;
  }

  struct State {
    uint256 daoFee;
    uint256 accumulatedRewardsPerShare;
    uint256 orderIndex;
    mapping(address => Contributor) contributors;
    mapping(uint256 => Order) orders;
    EnumerableSet.UintSet orderIds;
    address[] contributorAddresses;
  }

  event RewardsPerShareUpdated(uint256 accumulated);
  event Claimed(address user, uint256 amount);
  event SharesTransferred(address indexed from, address indexed to, uint256 amount);
  event ContributorAdded(address indexed account);
  event ShareOrderCreated(uint256 indexed orderId, address indexed seller, uint256 amount, uint256 price);
  event ShareOrderCanceled(uint256 indexed orderId, address indexed seller, uint256 amount, uint256 price);
  event ShareOrderExecuted(
    uint256 indexed orderId,
    address indexed seller,
    address buyer,
    uint256 amount,
    uint256 price
  );

  /** --- share --- */

  function transferShares(State storage self, address to, uint256 amount) public {
    require(self.contributors[msg.sender].exists, "Sender is not a contributor");
    require(self.contributors[msg.sender].shares >= amount, "Insufficient shares");
    require(to != address(0) && msg.sender != to, "Invalid recipient address");

    if (!self.contributors[to].exists) {
      addContributor(self, to);
    } else {
      _updateRewardsPerShare(self);
    }

    self.contributors[msg.sender].shares -= amount;
    self.contributors[to].shares += amount;
    emit SharesTransferred(msg.sender, to, amount);
  }

  function createShareOrder(State storage self, uint256 amount, uint256 price) external returns (uint256) {
    Contributor storage contributor = self.contributors[msg.sender];
    require(contributor.shares >= amount, "Insufficient share balance");
    require(amount > 0, "Amount must be greater than zero");
    self.orders[self.orderIndex] = Order(msg.sender, amount, price);
    self.orderIds.add(self.orderIndex);
    self.orderIndex++;
    return self.orderIndex - 1;
  }

  function cancelShareOrder(State storage self, uint256 orderId) external {
    Order storage order = self.orders[orderId];
    require(order.seller != address(0), "Order not found");
    require(order.seller == msg.sender, "Only seller can cancel order");
    self.orderIds.remove(orderId);
    delete self.orders[orderId];
  }

  function executeShareOrder(State storage self, uint256 orderId, uint256 amount) external {
    Order storage order = self.orders[orderId];
    require(order.seller != address(0), "Order not found");
    require(amount <= order.amount, "Amount too large");
    uint256 ethAmount = order.price * amount;
    require(msg.value >= ethAmount, "Insufficient payment");
    require(self.contributors[order.seller].shares >= amount, "Insufficient share of seller");

    TransferUtil.safeTransferETH(order.seller, ethAmount);

    if (!self.contributors[msg.sender].exists) {
      addContributor(self, msg.sender);
    }

    self.contributors[order.seller].shares -= amount;
    self.contributors[msg.sender].shares += amount;

    emit ShareOrderExecuted(orderId, order.seller, msg.sender, amount, order.price);

    if (amount == order.amount) {
      self.orderIds.remove(orderId);
      delete self.orders[orderId];
    } else {
      order.amount -= amount;
    }
  }

  function getShareOrders(State storage self) external view returns (Order[] memory) {
    uint256[] memory ids = self.orderIds.values();
    uint256 len = ids.length;
    Order[] memory orders = new Order[](len);

    for (uint256 i = 0; i < len; i++) {
      orders[i] = self.orders[ids[i]];
    }
    return orders;
  }

  /** --- contributor --- */

  function addContributor(State storage self, address account) public {
    require(!self.contributors[account].exists, "Contributor is existed");
    _updateRewardsPerShare(self);
    self.contributors[account] = Contributor(0, 0, 0, true);
    self.contributorAddresses.push(account);
    emit ContributorAdded(account);
  }

  function getContributor(State storage self, address account) public view returns (Contributor memory) {
    return self.contributors[account];
  }

  function getContributors(State storage self) public view returns (ContributorInfo[] memory) {
    ContributorInfo[] memory info = new ContributorInfo[](self.contributorAddresses.length);
    for (uint256 i = 0; i < self.contributorAddresses.length; i++) {
      info[i] = ContributorInfo(self.contributorAddresses[i], self.contributors[self.contributorAddresses[i]].shares);
    }
    return info;
  }

  function claim(State storage self) public returns (uint256) {
    address user = msg.sender;
    _updateRewardsPerShare(self);
    _updateContributorRewards(self, user);

    uint256 amount = self.contributors[user].rewards;
    self.contributors[user].rewards = 0;

    IERC20(address(this)).transfer(msg.sender, amount);

    emit Claimed(user, amount);
    return amount;
  }

  function distribute(State storage self) public {
    _updateRewardsPerShare(self);
  }

  function currentContributorRewards(State storage self, address user) public view returns (uint256) {
    Contributor memory contributor = self.contributors[user];

    uint256 currentAccumulatedRewardsPerShare = _calculateRewardsPerShare(self);

    uint256 rewards = contributor.rewards +
      _calculateContributorRewards(contributor.shares, contributor.checkpoint, currentAccumulatedRewardsPerShare);

    return rewards;
  }

  function _updateContributorRewards(State storage self, address user) internal {
    Contributor memory _contributor = self.contributors[user];

    // We skip the storage changes if already updated in the same block
    if (_contributor.checkpoint == self.accumulatedRewardsPerShare) {
      return;
    }

    // Calculate and update the new value user reserves.
    _contributor.rewards += _calculateContributorRewards(
      _contributor.shares,
      _contributor.checkpoint,
      self.accumulatedRewardsPerShare
    );

    _contributor.checkpoint = self.accumulatedRewardsPerShare;

    self.contributors[user] = _contributor;
  }

  function _updateRewardsPerShare(State storage self) internal returns (uint256) {
    uint256 rewardsPerShareOut = _calculateRewardsPerShare(self);
    bool isChanged = self.accumulatedRewardsPerShare != rewardsPerShareOut;
    // console.log('=====isChanged:', isChanged);

    if (isChanged) {
      self.daoFee = 0;
    }

    self.accumulatedRewardsPerShare = rewardsPerShareOut;

    emit RewardsPerShareUpdated(rewardsPerShareOut);

    return rewardsPerShareOut;
  }

  function _calculateContributorRewards(
    uint256 shares,
    uint256 earlierCheckpoint,
    uint256 latterCheckpoint
  ) internal pure returns (uint256) {
    return (shares * (latterCheckpoint - earlierCheckpoint)) / PER_SHARE_PRECISION;
  }

  function _calculateRewardsPerShare(State storage self) internal view returns (uint256) {
    return self.accumulatedRewardsPerShare + (PER_SHARE_PRECISION * self.daoFee) / SHARES_SUPPLY;
  }
}
