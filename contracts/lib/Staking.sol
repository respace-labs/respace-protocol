// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";

library Staking {
  using SafeERC20 for IERC20;

  uint256 public constant PER_TOKEN_PRECISION = 10 ** 18;

  struct Info {
    uint256 stakingFee;
    uint256 totalStaked;
    uint256 accumulatedRewardsPerToken;
  }

  struct State {
    uint256 stakingFee; // fee for rewards
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
    return self.accumulatedRewardsPerToken + (PER_TOKEN_PRECISION * self.stakingFee) / self.totalStaked;
  }

  /// @notice Calculate the rewards accumulated by a stake between two checkpoints.
  function _calculateUserRewards(
    uint256 _stake,
    uint256 earlierCheckpoint,
    uint256 latterCheckpoint
  ) internal pure returns (uint256) {
    return (_stake * (latterCheckpoint - earlierCheckpoint)) / PER_TOKEN_PRECISION;
  }

  function _updateRewardsPerToken(State storage self) internal returns (uint256) {
    uint256 rewardsPerTokenOut = _calculateRewardsPerToken(self);

    bool isChanged = self.accumulatedRewardsPerToken != rewardsPerTokenOut;

    if (isChanged) {
      self.stakingFee = 0;
    }

    self.accumulatedRewardsPerToken = rewardsPerTokenOut;

    emit RewardsPerTokenUpdated(rewardsPerTokenOut);

    return rewardsPerTokenOut;
  }

  function _updateUserRewards(State storage self, address user) internal returns (UserRewards memory) {
    _updateRewardsPerToken(self);
    UserRewards memory _userRewards = self.accumulatedRewards[user];

    // We skip the storage changes if already updated in the same block
    if (_userRewards.checkpoint == self.accumulatedRewardsPerToken) return _userRewards;

    // Calculate and update the new value user reserves.
    _userRewards.accumulated += _calculateUserRewards(
      self.userStake[user],
      _userRewards.checkpoint,
      self.accumulatedRewardsPerToken
    );

    _userRewards.checkpoint = self.accumulatedRewardsPerToken;

    self.accumulatedRewards[user] = _userRewards;
    emit UserRewardsUpdated(user, _userRewards.accumulated, _userRewards.checkpoint);

    return _userRewards;
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

    console.log("=======amount:", amount);

    IERC20(address(this)).transfer(msg.sender, amount);
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
