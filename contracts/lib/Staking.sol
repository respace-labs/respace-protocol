// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";
import "./Events.sol";
import "./Constants.sol";

// creator rewards

library Staking {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.AddressSet;

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

  function stake(State storage self, EnumerableSet.AddressSet storage stakers, uint256 amount) external {
    address account = msg.sender;
    _updateUserRewards(self, account);
    IERC20(address(this)).safeTransferFrom(account, address(this), amount);
    self.totalStaked += amount;
    self.userStaked[account] += amount;
    if (!stakers.contains(account)) stakers.add(account);
  }

  function unstake(State storage self, EnumerableSet.AddressSet storage stakers, uint256 amount) external {
    address account = msg.sender;
    require(amount > 0, "Amount must be greater than zero");
    require(amount <= self.userStaked[account], "Amount too large");

    _updateUserRewards(self, account);
    self.totalStaked -= amount;
    self.userStaked[account] -= amount;
    if (self.userStaked[account] == 0) stakers.remove(account);
    IERC20(address(this)).safeTransfer(account, amount);
  }

  function claim(State storage self) external returns (uint256) {
    address account = msg.sender;
    _updateUserRewards(self, account);

    uint256 amount = self.userRewards[account].realized;
    self.userRewards[account].realized = 0;

    IERC20(address(this)).transfer(msg.sender, amount);
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

  function currentUserRewards(State storage self, address account) external view returns (uint256) {
    UserRewards memory accumulatedRewards = self.userRewards[account];

    uint256 currentAccumulatedRewardsPerToken = _calculateRewardsPerToken(self);

    uint256 rewards = accumulatedRewards.realized +
      _calculateRealizedRewards(
        self.userStaked[account],
        accumulatedRewards.checkpoint,
        currentAccumulatedRewardsPerToken
      );

    return rewards;
  }

  function releasedYieldAmount(State storage self, uint256 timestamp) public view returns (uint256) {
    if (timestamp < self.yieldStartTime) {
      return 0;
    } else if (timestamp > self.yieldStartTime + YIELD_DURATION) {
      return self.yieldAmount;
    } else {
      return (self.yieldAmount * (timestamp - self.yieldStartTime)) / YIELD_DURATION;
    }
  }

  function _releaseYield(State storage self) internal {
    uint256 releasable = releasedYieldAmount(self, block.timestamp) - self.yieldReleased;

    if (releasable > 0 && IERC20(address(this)).balanceOf(address(this)) >= releasable) {
      self.stakingFee += releasable;
      self.yieldReleased += releasable;
      emit Events.YieldReleased(releasable);
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
      emit Events.RewardsPerTokenUpdated(rewardsPerToken);
    }

    return rewardsPerToken;
  }

  function _updateUserRewards(State storage self, address account) internal returns (UserRewards memory) {
    _releaseYield(self);
    _updateRewardsPerToken(self);
    UserRewards memory userRewards = self.userRewards[account];

    // We skip the storage changes if already updated in the same block
    if (userRewards.checkpoint == self.accumulatedRewardsPerToken) {
      return userRewards;
    }

    // Calculate and update the new value user reserves.
    userRewards.realized += _calculateRealizedRewards(
      self.userStaked[account],
      userRewards.checkpoint,
      self.accumulatedRewardsPerToken
    );

    userRewards.checkpoint = self.accumulatedRewardsPerToken;

    self.userRewards[account] = userRewards;
    emit Events.UserRewardsUpdated(account, userRewards.realized, userRewards.checkpoint);

    return userRewards;
  }
}
