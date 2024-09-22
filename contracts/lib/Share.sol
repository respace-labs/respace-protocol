// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./TransferUtil.sol";
import "./Events.sol";
import "./Errors.sol";
import "./Constants.sol";
import "hardhat/console.sol";

library Share {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.UintSet;
  using EnumerableSet for EnumerableSet.AddressSet;

  struct Contributor {
    address account;
    uint256 shares;
    uint256 rewards; // realized rewards (unclaimed)
    uint256 checkpoint;
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
    Contributor memory contributor = self.contributors[msg.sender];
    if (contributor.account == address(0)) {
      revert Errors.OnlyContributor();
    }
    if (contributor.shares < amount) {
      revert Errors.InsufficientShares();
    }
    if (to == address(0) || msg.sender == to) {
      revert Errors.InvalidRecipient();
    }

    if (self.contributors[to].account == address(0)) {
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
  ) external returns (uint256 orderId) {
    Contributor storage contributor = self.contributors[msg.sender];
    if (contributor.shares < amount) revert Errors.InsufficientShares();
    if (amount == 0) revert Errors.AmountIsZero();
    orderId = self.orderIndex;
    self.orders[orderId] = Order(msg.sender, amount, price);
    orderIds.add(orderId);
    self.orderIndex++;
  }

  function cancelShareOrder(
    State storage self,
    EnumerableSet.UintSet storage orderIds,
    uint256 orderId
  ) external returns (uint256 amount, uint256 price) {
    Order storage order = self.orders[orderId];
    if (order.seller == address(0)) revert Errors.OrderNotFound();
    if (order.seller != msg.sender) revert Errors.OnlySeller();
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
    if (order.seller == address(0)) revert Errors.OrderNotFound();
    if (amount > order.amount) revert Errors.ExceedOrderAmount();
    uint256 ethAmount = order.price * amount;
    if (msg.value < ethAmount) revert Errors.InsufficientPayment();
    if (self.contributors[order.seller].shares < amount) {
      revert Errors.InsufficientShares();
    }

    TransferUtil.safeTransferETH(order.seller, ethAmount);

    if (self.contributors[msg.sender].account == address(0)) {
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
    if (self.contributors[account].account != address(0)) {
      revert Errors.ContributorExisted();
    }
    _updateRewardsPerShare(self);
    self.contributors[account] = Contributor(account, 0, 0, 0);
    self.contributorAddresses.push(account);
  }

  function getContributors(State storage self) external view returns (Contributor[] memory) {
    Contributor[] memory info = new Contributor[](self.contributorAddresses.length);
    for (uint256 i = 0; i < self.contributorAddresses.length; i++) {
      info[i] = self.contributors[self.contributorAddresses[i]];
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
    if (beneficiary == address(0) || beneficiary == msg.sender) {
      revert Errors.InvalidBeneficiary();
    }
    if (vestingAddresses.contains(beneficiary)) {
      revert Errors.BeneficiaryExists();
    }

    Contributor memory payer = self.contributors[msg.sender];

    if (payer.shares < allocation) {
      revert Errors.AllocationTooLarge();
    }

    if (self.contributors[beneficiary].account == address(0)) {
      addContributor(self, beneficiary);
    }

    self.vestings[beneficiary] = Vesting(msg.sender, startTime, duration, allocation, 0);
    vestingAddresses.add(beneficiary);
  }

  function claimVesting(State storage self) external returns (uint256) {
    return _claimVesting(self, msg.sender);
  }

  function _claimVesting(State storage self, address beneficiary) internal returns (uint256 releasable) {
    Vesting storage vesting = self.vestings[beneficiary];
    if (vesting.start == 0) revert Errors.BeneficiaryNotFound();

    releasable = vestedAmount(self, beneficiary, block.timestamp) - vesting.released;

    if (releasable > 0) {
      vesting.released += releasable;
      emit Events.VestingReleased(vesting.payer, beneficiary, releasable);

      if (self.contributors[vesting.payer].shares <= releasable) {
        revert Errors.InsufficientShares();
      }

      self.contributors[vesting.payer].shares -= releasable;
      self.contributors[beneficiary].shares += releasable;
    }
  }

  function vestedAmount(State storage self, address beneficiary, uint256 timestamp) public view returns (uint256) {
    Vesting memory vesting = self.vestings[beneficiary];

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
    if (vesting.start == 0) revert Errors.BeneficiaryNotFound();
    if (vesting.payer != msg.sender) revert Errors.OnlyPayer();
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

    if (contributor.checkpoint == self.accumulatedRewardsPerShare) {
      return;
    }

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
