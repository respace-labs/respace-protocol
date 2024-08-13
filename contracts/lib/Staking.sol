// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";
import "./TransferUtil.sol";

library Staking {
  using SafeERC20 for IERC20;

  uint256 public constant PER_TOKEN_PRECISION = 10 ** 18;

  struct Info {
    uint256 stakingFees;
    uint256 totalStaked;
    uint256 accumulatedRewardsPerToken;
  }

  struct State {
    uint256 stakingFees; // fee for rewards
    uint256 totalStaked; // Total amount staked
    uint256 accumulatedRewardsPerToken;
    mapping(address => uint256) userStake; // Amount staked per user
    mapping(address => UserRewards) accumulatedRewards; // Rewards accumulated per user
  }

  struct UserRewards {
    uint256 accumulated; // realized reward token amount
    // checkpoint to compare with RewardsPerToken.accumulated
    uint256 checkpoint;
  }

  event Staked(address user, uint256 amount);
  event Unstaked(address user, uint256 amount);
  event Claimed(address user, uint256 amount);
  event RewardsPerTokenUpdated(uint256 accumulated);
  event UserRewardsUpdated(address user, uint256 rewards, uint256 checkpoint);
  event Received(address sender, uint256 stakingFee);

  function _calculateRewardsPerToken(State storage self) internal view returns (uint256) {
    if (self.totalStaked == 0) return self.accumulatedRewardsPerToken;
    return self.accumulatedRewardsPerToken + (PER_TOKEN_PRECISION * self.stakingFees) / self.totalStaked;
  }

  /// @notice Calculate the rewards accumulated by a stake between two checkpoints.
  function _calculateUserRewards(
    uint256 stake_,
    uint256 earlierCheckpoint,
    uint256 latterCheckpoint
  ) internal pure returns (uint256) {
    return (stake_ * (latterCheckpoint - earlierCheckpoint)) / PER_TOKEN_PRECISION;
  }

  function _updateRewardsPerToken(State storage self) internal returns (uint256) {
    uint256 rewardsPerTokenOut = _calculateRewardsPerToken(self);

    bool isChanged = self.accumulatedRewardsPerToken != rewardsPerTokenOut;

    if (isChanged) {
      self.stakingFees = 0;
    }

    self.accumulatedRewardsPerToken = rewardsPerTokenOut;

    emit RewardsPerTokenUpdated(rewardsPerTokenOut);

    return rewardsPerTokenOut;
  }

  function _updateUserRewards(State storage self, address user) internal returns (UserRewards memory) {
    _updateRewardsPerToken(self);
    UserRewards memory userRewards_ = self.accumulatedRewards[user];

    // We skip the storage changes if already updated in the same block
    if (userRewards_.checkpoint == self.accumulatedRewardsPerToken) return userRewards_;

    // Calculate and update the new value user reserves.
    userRewards_.accumulated += _calculateUserRewards(
      self.userStake[user],
      userRewards_.checkpoint,
      self.accumulatedRewardsPerToken
    );

    userRewards_.checkpoint = self.accumulatedRewardsPerToken;

    self.accumulatedRewards[user] = userRewards_;
    emit UserRewardsUpdated(user, userRewards_.accumulated, userRewards_.checkpoint);

    return userRewards_;
  }

  /// @notice Stake tokens.
  function stake(State storage self, uint256 amount) public {
    address user = msg.sender;
    _updateUserRewards(self, user);
    self.totalStaked += amount;
    self.userStake[user] += amount;
    IERC20(address(this)).safeTransferFrom(user, address(this), amount);
    emit Staked(user, amount);
  }

  /// @notice Unstake tokens.
  function unstake(State storage self, uint256 amount) public {
    address user = msg.sender;
    _updateUserRewards(self, user);
    self.totalStaked -= amount;
    self.userStake[user] -= amount;
    IERC20(address(this)).safeTransfer(user, amount);
    emit Unstaked(user, amount);
  }

  /// @notice Claim all rewards for the caller.
  function claim(State storage self) public returns (uint256) {
    address user = msg.sender;
    _updateUserRewards(self, user);

    uint256 amount = self.accumulatedRewards[user].accumulated;
    self.accumulatedRewards[user].accumulated = 0;

    TransferUtil.safeTransferETH(user, amount);

    emit Claimed(user, amount);
    return amount;
  }

  function distribute(State storage self) public {
    _updateRewardsPerToken(self);
  }

  /// @notice Calculate and return current rewards per token.
  function currentRewardsPerToken(State storage self) public view returns (uint256) {
    return _calculateRewardsPerToken(self);
  }

  /// @notice Calculate and return current rewards for a user.
  /// @dev This repeats the logic used on transactions, but doesn't update the storage.
  function currentUserRewards(State storage self, address user) public view returns (uint256) {
    UserRewards memory _accumulatedRewards = self.accumulatedRewards[user];

    uint256 currentAccumulatedRewardsPerToken = _calculateRewardsPerToken(self);

    uint256 rewards = _accumulatedRewards.accumulated +
      _calculateUserRewards(self.userStake[user], _accumulatedRewards.checkpoint, currentAccumulatedRewardsPerToken);

    return rewards;
  }
}
