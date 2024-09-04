// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./TransferUtil.sol";
import "hardhat/console.sol";

library Share {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.UintSet;
  using EnumerableSet for EnumerableSet.AddressSet;

  uint256 public constant PER_SHARE_PRECISION = 10 ** 18;
  uint256 public constant SHARES_SUPPLY = 1_000_000;

  struct Contributor {
    uint256 shares;
    uint256 rewards; // realized rewards (unclaimed)
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

  struct Vesting {
    address payer;
    uint256 start;
    uint256 duration;
    uint256 allocation; // allocation share amount
    uint256 released; // released share amount
  }

  struct VestingInfo {
    address beneficiary;
    address payer;
    uint256 start;
    uint256 duration;
    uint256 allocation;
    uint256 released;
  }

  struct State {
    uint256 daoFee;
    uint256 accumulatedRewardsPerShare;
    uint256 orderIndex;
    mapping(address => Contributor) contributors;
    mapping(uint256 => Order) orders;
    EnumerableSet.UintSet orderIds;
    address[] contributorAddresses;
    mapping(address => Vesting) vestings;
    EnumerableSet.AddressSet vestingAddresses;
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
  event VestingAdded(
    address indexed payer,
    address indexed beneficiary,
    uint256 start,
    uint256 duration,
    uint256 allocation
  );
  event VestingReleased(address indexed payer, address indexed beneficiary, uint256 amount);

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

  function claimRewards(State storage self) public returns (uint256) {
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

  /** ----- Vesting ------ */

  function addVesting(
    State storage self,
    address beneficiary,
    uint256 startTime,
    uint256 duration,
    uint256 allocation
  ) external {
    require(beneficiary != address(0), "Beneficiary is zero address");
    require(!self.vestingAddresses.contains(beneficiary), "Beneficiary already exists");
    Contributor memory payer = self.contributors[msg.sender];
    require(payer.shares >= allocation, "Allocation too large");

    if (!self.contributors[beneficiary].exists) {
      addContributor(self, beneficiary);
    }

    self.vestings[beneficiary] = Vesting(msg.sender, startTime, duration, allocation, 0);
    self.vestingAddresses.add(beneficiary);

    emit VestingAdded(msg.sender, beneficiary, startTime, duration, allocation);
  }

  function claimVesting(State storage self) external {
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

  function removeVesting(State storage self, address beneficiary) external {
    Vesting memory vesting = self.vestings[beneficiary];
    require(vesting.start != 0, "Beneficiary does not exist");
    require(vesting.payer == msg.sender, "Only payer can remove vesting");
    self.vestingAddresses.remove(beneficiary);
    delete self.vestings[beneficiary];
  }

  function getVestings(State storage self) external view returns (VestingInfo[] memory) {
    address[] memory accounts = self.vestingAddresses.values();
    uint256 len = accounts.length;
    VestingInfo[] memory vestings = new VestingInfo[](len);

    for (uint256 i = 0; i < len; i++) {
      Vesting memory vesting = self.vestings[accounts[i]];
      vestings[i] = VestingInfo(
        accounts[i],
        vesting.payer,
        vesting.start,
        vesting.duration,
        vesting.allocation,
        vesting.released
      );
    }
    return vestings;
  }

  function _updateContributorRewards(State storage self, address user) internal {
    Contributor memory contributor = self.contributors[user];

    // We skip the storage changes if already updated in the same block
    if (contributor.checkpoint == self.accumulatedRewardsPerShare) {
      return;
    }

    // Calculate and update the new value user reserves.
    contributor.rewards += _calculateContributorRewards(
      contributor.shares,
      contributor.checkpoint,
      self.accumulatedRewardsPerShare
    );

    contributor.checkpoint = self.accumulatedRewardsPerShare;
    self.contributors[user] = contributor;
  }

  function _updateRewardsPerShare(State storage self) internal returns (uint256 rewardsPerShare) {
    rewardsPerShare = _calculateRewardsPerShare(self);
    bool isChanged = self.accumulatedRewardsPerShare != rewardsPerShare;
    // console.log('=====isChanged:', isChanged);

    if (isChanged) {
      self.daoFee = 0;
      self.accumulatedRewardsPerShare = rewardsPerShare;
      emit RewardsPerShareUpdated(rewardsPerShare);
    }
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
