// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./TransferUtil.sol";
import "./Events.sol";
import "./Constants.sol";
import "hardhat/console.sol";

library Share {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.UintSet;
  using EnumerableSet for EnumerableSet.AddressSet;

  struct Contributor {
    uint256 shares;
    uint256 rewards; // realized rewards (unclaimed)
    uint256 checkpoint;
    bool exists;
  }

  struct ContributorInfo {
    address account;
    uint256 shares;
    uint256 rewards; // realized rewards (unclaimed)
    uint256 checkpoint;
    bool exists;
  }

  struct Order {
    address seller;
    uint256 amount;
    uint256 price;
  }

  struct OrderInfo {
    uint256 orderId;
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
    address[] contributorAddresses;
    mapping(address => Vesting) vestings;
  }

  /** --- share --- */

  function transferShares(State storage self, address to, uint256 amount) external {
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
  }

  function createShareOrder(
    State storage self,
    EnumerableSet.UintSet storage orderIds,
    uint256 amount,
    uint256 price
  ) external returns (uint256) {
    Contributor storage contributor = self.contributors[msg.sender];
    require(contributor.shares >= amount, "Insufficient share balance");
    require(amount > 0, "Amount must be greater than zero");
    self.orders[self.orderIndex] = Order(msg.sender, amount, price);
    orderIds.add(self.orderIndex);
    self.orderIndex++;
    return self.orderIndex - 1;
  }

  function cancelShareOrder(
    State storage self,
    EnumerableSet.UintSet storage orderIds,
    uint256 orderId
  ) external returns (uint256 amount, uint256 price) {
    Order storage order = self.orders[orderId];
    require(order.seller != address(0), "Order not found");
    require(order.seller == msg.sender, "Only seller can cancel order");
    amount = order.amount;
    price = order.price;
    orderIds.remove(orderId);
    delete self.orders[orderId];
  }

  function executeShareOrder(
    State storage self,
    EnumerableSet.UintSet storage orderIds,
    uint256 orderId,
    uint256 amount
  ) external returns (address seller, uint256 price) {
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

    seller = order.seller;
    price = order.price;

    if (amount == order.amount) {
      orderIds.remove(orderId);
      delete self.orders[orderId];
    } else {
      order.amount -= amount;
    }
  }

  function getShareOrders(
    State storage self,
    EnumerableSet.UintSet storage orderIds
  ) external view returns (OrderInfo[] memory) {
    uint256[] memory ids = orderIds.values();
    uint256 len = ids.length;
    OrderInfo[] memory orders = new OrderInfo[](len);

    for (uint256 i = 0; i < len; i++) {
      Order memory order = self.orders[ids[i]];
      orders[i] = OrderInfo(ids[i], order.seller, order.amount, order.price);
    }
    return orders;
  }

  /** --- contributor --- */

  function addContributor(State storage self, address account) public {
    require(!self.contributors[account].exists, "Contributor is existed");
    _updateRewardsPerShare(self);
    self.contributors[account] = Contributor(0, 0, 0, true);
    self.contributorAddresses.push(account);
  }

  function getContributors(State storage self) external view returns (ContributorInfo[] memory) {
    ContributorInfo[] memory info = new ContributorInfo[](self.contributorAddresses.length);
    for (uint256 i = 0; i < self.contributorAddresses.length; i++) {
      Contributor memory contributor = self.contributors[self.contributorAddresses[i]];
      info[i] = ContributorInfo(
        self.contributorAddresses[i],
        contributor.shares,
        contributor.rewards,
        contributor.checkpoint,
        contributor.exists
      );
    }
    return info;
  }

  function claimRewards(State storage self) external returns (uint256 amount) {
    address account = msg.sender;
    _updateRewardsPerShare(self);
    _updateContributorRewards(self, account);

    amount = self.contributors[account].rewards;
    self.contributors[account].rewards = 0;

    IERC20(address(this)).transfer(msg.sender, amount);
  }

  function distribute(State storage self) external {
    _updateRewardsPerShare(self);
  }

  function currentContributorRewards(State storage self, address account) external view returns (uint256) {
    Contributor memory contributor = self.contributors[account];

    uint256 currentAccumulatedRewardsPerShare = _calculateRewardsPerShare(self);

    uint256 rewards = contributor.rewards +
      _calculateContributorRewards(contributor.shares, contributor.checkpoint, currentAccumulatedRewardsPerShare);

    return rewards;
  }

  /** ----- Vesting ------ */

  function addVesting(
    State storage self,
    EnumerableSet.AddressSet storage vestingAddresses,
    address beneficiary,
    uint256 startTime,
    uint256 duration,
    uint256 allocation
  ) external {
    require(beneficiary != address(0), "Beneficiary is zero address");
    require(beneficiary != msg.sender, "Beneficiary can no be yourself");
    require(!vestingAddresses.contains(beneficiary), "Beneficiary already exists");
    Contributor memory payer = self.contributors[msg.sender];
    require(payer.shares >= allocation, "Allocation too large");

    if (!self.contributors[beneficiary].exists) {
      addContributor(self, beneficiary);
    }

    self.vestings[beneficiary] = Vesting(msg.sender, startTime, duration, allocation, 0);
    vestingAddresses.add(beneficiary);
  }

  function claimVesting(State storage self) external returns (uint256) {
    address beneficiary = msg.sender;
    return _claimVesting(self, beneficiary);
  }

  function _claimVesting(State storage self, address beneficiary) internal returns (uint256 releasable) {
    Vesting storage vesting = self.vestings[beneficiary];
    require(vesting.start != 0, "Beneficiary does not exist");

    releasable = vestedAmount(self, beneficiary, block.timestamp) - vesting.released;

    if (releasable > 0) {
      vesting.released += releasable;
      emit Events.VestingReleased(vesting.payer, beneficiary, releasable);

      require(self.contributors[vesting.payer].shares > releasable, "Insufficient shares");
      self.contributors[vesting.payer].shares -= releasable;
      self.contributors[beneficiary].shares += releasable;
    }
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

  function removeVesting(
    State storage self,
    EnumerableSet.AddressSet storage vestingAddresses,
    address beneficiary
  ) external {
    Vesting memory vesting = self.vestings[beneficiary];
    require(vesting.start != 0, "Beneficiary does not exist");
    require(vesting.payer == msg.sender, "Only payer can remove vesting");
    _claimVesting(self, beneficiary);
    vestingAddresses.remove(beneficiary);
    delete self.vestings[beneficiary];
  }

  function getVestings(
    State storage self,
    EnumerableSet.AddressSet storage vestingAddresses
  ) external view returns (VestingInfo[] memory) {
    address[] memory accounts = vestingAddresses.values();
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

  function _updateContributorRewards(State storage self, address account) internal {
    Contributor memory contributor = self.contributors[account];

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
    self.contributors[account] = contributor;
  }

  function _updateRewardsPerShare(State storage self) internal returns (uint256 rewardsPerShare) {
    rewardsPerShare = _calculateRewardsPerShare(self);
    bool isChanged = self.accumulatedRewardsPerShare != rewardsPerShare;
    // console.log('=====isChanged:', isChanged);

    if (isChanged) {
      self.daoFee = 0;
      self.accumulatedRewardsPerShare = rewardsPerShare;
      emit Events.RewardsPerShareUpdated(rewardsPerShare);
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
