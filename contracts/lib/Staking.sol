// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";

// creator rewards

library Staking {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.AddressSet;

  uint256 constant PER_TOKEN_PRECISION = 10 ** 26;

  // two year
  uint256 constant yieldDuration = 24 * 60 * 60 * 30 * 365 * 2;

  struct State {
    uint256 yieldStartTime;
    uint256 yieldAmount; // yield from space
    uint256 yieldReleased;
    uint256 stakingFee; // fee for rewards
    uint256 totalStaked; // Total amount staked
    uint256 accumulatedRewardsPerToken;
    mapping(address => uint256) userStaked;
    mapping(address => UserRewards) userRewards; // Rewards accumulated per user
  }

  struct UserRewards {
    uint256 realized; // realized reward token amount
    // checkpoint to compare with RewardsPerToken.accumulated
    uint256 checkpoint;
  }

  struct Staker {
    address account;
    uint256 staked;
    uint256 realized;
    uint256 checkpoint;
  }

  enum StakingType {
    Stake,
    Unstake
  }

  event StakingEvent(StakingType indexed stakingType, address indexed user, uint256 amount);
  event Claimed(address user, uint256 amount);
  event RewardsPerTokenUpdated(uint256 accumulated);
  event UserRewardsUpdated(address user, uint256 rewards, uint256 checkpoint);
  event YieldReleased(uint256 amount);

  function stake(State storage self, EnumerableSet.AddressSet storage stakers, uint256 amount) external {
    address user = msg.sender;
    _updateUserRewards(self, user);
    IERC20(address(this)).safeTransferFrom(user, address(this), amount);
    self.totalStaked += amount;
    self.userStaked[user] += amount;
    if (!stakers.contains(user)) stakers.add(user);
    emit StakingEvent(StakingType.Stake, user, amount);
  }

  function unstake(State storage self, EnumerableSet.AddressSet storage stakers, uint256 amount) external {
    address user = msg.sender;
    require(amount > 0, "Amount must be greater than zero");
    require(amount <= self.userStaked[user], "Amount too large");

    _updateUserRewards(self, user);
    self.totalStaked -= amount;
    self.userStaked[user] -= amount;
    if (self.userStaked[user] == 0) stakers.remove(user);
    IERC20(address(this)).safeTransfer(user, amount);
    emit StakingEvent(StakingType.Unstake, user, amount);
  }

  function claim(State storage self) external returns (uint256) {
    address user = msg.sender;
    _updateUserRewards(self, user);

    uint256 amount = self.userRewards[user].realized;
    self.userRewards[user].realized = 0;

    IERC20(address(this)).transfer(msg.sender, amount);
    emit Claimed(user, amount);
    return amount;
  }

  function getStakers(
    State storage self,
    EnumerableSet.AddressSet storage _stakers
  ) external view returns (Staker[] memory) {
    address[] memory accounts = _stakers.values();
    uint256 len = accounts.length;
    Staker[] memory stakers = new Staker[](len);

    for (uint256 i = 0; i < len; i++) {
      address account = accounts[i];
      stakers[i] = Staker(
        account,
        self.userStaked[account],
        self.userRewards[account].realized,
        self.userRewards[account].checkpoint
      );
    }
    return stakers;
  }

  function currentRewardsPerToken(State storage self) external view returns (uint256) {
    return _calculateRewardsPerToken(self);
  }

  function currentUserRewards(State storage self, address user) external view returns (uint256) {
    UserRewards memory accumulatedRewards = self.userRewards[user];

    uint256 currentAccumulatedRewardsPerToken = _calculateRewardsPerToken(self);

    uint256 rewards = accumulatedRewards.realized +
      _calculateRealizedRewards(
        self.userStaked[user],
        accumulatedRewards.checkpoint,
        currentAccumulatedRewardsPerToken
      );

    return rewards;
  }

  function releasedYieldAmount(State storage self, uint256 timestamp) public view returns (uint256) {
    if (timestamp < self.yieldStartTime) {
      return 0;
    } else if (timestamp > self.yieldStartTime + yieldDuration) {
      return self.yieldAmount;
    } else {
      return (self.yieldAmount * (timestamp - self.yieldStartTime)) / yieldDuration;
    }
  }

  function _releaseYield(State storage self) internal {
    uint256 releasable = releasedYieldAmount(self, block.timestamp) - self.yieldReleased;

    if (releasable > 0 && IERC20(address(this)).balanceOf(address(this)) >= releasable) {
      self.stakingFee += releasable;
      self.yieldReleased += releasable;
      emit YieldReleased(releasable);
    }
  }

  function _calculateRewardsPerToken(State storage self) internal view returns (uint256 rewardsPerToken) {
    if (self.totalStaked == 0) return self.accumulatedRewardsPerToken;
    uint256 releasable = releasedYieldAmount(self, block.timestamp) - self.yieldReleased;
    uint256 stakingFee = self.stakingFee + releasable;
    rewardsPerToken = self.accumulatedRewardsPerToken + (PER_TOKEN_PRECISION * stakingFee) / self.totalStaked;
  }

  function _calculateRealizedRewards(
    uint256 staked,
    uint256 checkpoint,
    uint256 accumulatedRewardsPerToken
  ) internal pure returns (uint256) {
    return (staked * (accumulatedRewardsPerToken - checkpoint)) / PER_TOKEN_PRECISION;
  }

  function _updateRewardsPerToken(State storage self) internal returns (uint256) {
    uint256 rewardsPerToken = _calculateRewardsPerToken(self);

    bool isChanged = self.accumulatedRewardsPerToken != rewardsPerToken;

    // console.log("=========isChanged:", isChanged);
    if (isChanged) {
      self.stakingFee = 0;
      self.accumulatedRewardsPerToken = rewardsPerToken;
      emit RewardsPerTokenUpdated(rewardsPerToken);
    }

    return rewardsPerToken;
  }

  function _updateUserRewards(State storage self, address user) internal returns (UserRewards memory) {
    _releaseYield(self);
    _updateRewardsPerToken(self);
    UserRewards memory userRewards = self.userRewards[user];

    // We skip the storage changes if already updated in the same block
    if (userRewards.checkpoint == self.accumulatedRewardsPerToken) {
      return userRewards;
    }

    // Calculate and update the new value user reserves.
    userRewards.realized += _calculateRealizedRewards(
      self.userStaked[user],
      userRewards.checkpoint,
      self.accumulatedRewardsPerToken
    );

    userRewards.checkpoint = self.accumulatedRewardsPerToken;

    self.userRewards[user] = userRewards;
    emit UserRewardsUpdated(user, userRewards.realized, userRewards.checkpoint);

    return userRewards;
  }
}
