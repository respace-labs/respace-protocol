// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "hardhat/console.sol";

library Share {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.UintSet;

  uint256 public constant PER_SHARE_PRECISION = 10 ** 18;
  uint256 public constant MAX_SHARES_SUPPLY = 10_000_000;

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

  struct Vesting {
    address payer;
    uint256 start;
    uint256 duration;
    uint256 allocation;
    uint256 released;
  }

  struct Order {
    address seller;
    uint256 amount;
    uint256 price;
  }

  struct State {
    uint256 daoFee;
    uint256 totalShare;
    uint256 accumulatedRewardsPerShare;
    uint256 orderIndex;
    mapping(address => Contributor) contributors;
    mapping(address => Vesting) vestings;
    mapping(uint256 => Order) orders;
    EnumerableSet.UintSet orderIds;
    address[] contributorAddresses;
    address[] vestingAddresses;
  }

  event RewardsPerShareUpdated(uint256 accumulated);
  event Claimed(address user, uint256 amount);
  event SharesTransferred(address indexed from, address indexed to, uint256 amount);
  event ContributorAdded(address indexed account);
  event VestingAdded(
    address indexed payer,
    address indexed beneficiary,
    uint256 start,
    uint256 duration,
    uint256 allocation
  );
  event VestingReleased(address indexed payer, address indexed beneficiary, uint256 amount);
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
    require(to != address(0) || msg.sender == to, "Invalid recipient address");

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
    require(order.seller == msg.sender, "Only seller can cancel order");
    self.orderIds.remove(orderId);
    delete self.orders[orderId];
  }

  function executeShareOrder(State storage self, uint256 orderId, uint256 amount) external {
    Order storage order = self.orders[orderId];
    require(order.seller != address(0), "Order not found");
    require(amount <= order.amount, "Invalid amount");
    uint256 ethAmount = order.price * amount;
    require(msg.value >= ethAmount, "Insufficient payment");
    self.orderIds.remove(orderId);
    transferShares(self, msg.sender, amount);

    emit ShareOrderExecuted(orderId, order.seller, msg.sender, amount, order.price);

    if (amount == order.amount) {
      self.orderIds.remove(orderId);
      delete self.orders[orderId];
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

  function addVesting(
    State storage self,
    address beneficiaryAddress,
    uint256 startTimestamp,
    uint256 durationSeconds,
    uint256 allocationAmount
  ) external {
    require(beneficiaryAddress != address(0), "Beneficiary is zero address");
    require(self.vestings[beneficiaryAddress].start == 0, "Beneficiary already exists");

    if (!self.contributors[beneficiaryAddress].exists) {
      addContributor(self, beneficiaryAddress);
    } else {
      _updateRewardsPerShare(self);
    }

    self.vestings[beneficiaryAddress] = Vesting(msg.sender, startTimestamp, durationSeconds, allocationAmount, 0);

    self.vestingAddresses.push(beneficiaryAddress);

    emit VestingAdded(msg.sender, beneficiaryAddress, startTimestamp, durationSeconds, allocationAmount);
  }

  function releaseVesting(State storage self) external {
    Vesting storage vesting = self.vestings[msg.sender];
    require(vesting.start != 0, "Beneficiary does not exist");

    uint256 releasable = vestedAmount(self, msg.sender, block.timestamp) - vesting.released;

    require(releasable > 0, "No shares are due for release");

    vesting.released += releasable;
    emit VestingReleased(vesting.payer, msg.sender, releasable);

    require(self.contributors[vesting.payer].shares > releasable, "Insufficient shares");
    self.contributors[vesting.payer].shares -= releasable;
    self.contributors[msg.sender].shares += releasable;
  }

  function vestedAmount(State storage self, address beneficiary, uint256 timestamp) public view returns (uint256) {
    Vesting storage vesting = self.vestings[beneficiary];

    if (timestamp < vesting.start) {
      return 0;
    } else if (timestamp > vesting.start + vesting.duration) {
      return vesting.allocation;
    } else {
      return (vesting.allocation * (timestamp - vesting.start)) / vesting.duration;
    }
  }

  function getVestings(State storage self) external view returns (address[] memory) {
    return self.vestingAddresses;
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
    if (self.totalShare == 0) return self.accumulatedRewardsPerShare;
    return self.accumulatedRewardsPerShare + (PER_SHARE_PRECISION * self.daoFee) / self.totalShare;
  }
}
