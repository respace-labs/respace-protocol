// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract StakingRewards is ReentrancyGuard {
  using SafeERC20 for IERC20;

  uint256 public constant PER_TOKEN_PRECISION = 10 ** 18;
  address token;
  uint256 public daoFeePercent = 0.5 ether; // 50%

  uint256 public stakingFees = 0; // fee for rewards

  IERC20 public immutable stakingToken; // Token to be staked
  uint256 public totalStaked; // Total amount staked
  mapping(address => uint256) public userStake; // Amount staked per user

  uint256 public accumulatedRewardsPerToken = 0;

  mapping(address => UserRewards) public accumulatedRewards; // Rewards accumulated per user

  event Staked(address user, uint256 amount);
  event Unstaked(address user, uint256 amount);
  event Claimed(address user, uint256 amount);
  event RewardsPerTokenUpdated(uint256 accumulated);
  event UserRewardsUpdated(address user, uint256 rewards, uint256 checkpoint);
  event Received(address sender, uint256 stakingFee);

  struct UserRewards {
    uint256 accumulated; // realized reward token amount
    // checkpoint to compare with RewardsPerToken.accumulated
    uint256 checkpoint;
  }

  constructor(address _stakingToken) {
    stakingToken = IERC20(_stakingToken);
  }

  fallback() external payable {}

  receive() external payable {
    stakingFees = msg.value;
    emit Received(msg.sender, stakingFees);
  }

  function _calculateRewardsPerToken() internal view returns (uint256) {
    if (totalStaked == 0) return accumulatedRewardsPerToken;
    return accumulatedRewardsPerToken + (PER_TOKEN_PRECISION * stakingFees) / totalStaked;
  }

  /// @notice Calculate the rewards accumulated by a stake between two checkpoints.
  function _calculateUserRewards(
    uint256 stake_,
    uint256 earlierCheckpoint,
    uint256 latterCheckpoint
  ) internal pure returns (uint256) {
    return (stake_ * (latterCheckpoint - earlierCheckpoint)) / PER_TOKEN_PRECISION;
  }

  function _updateRewardsPerToken() internal returns (uint256) {
    uint256 rewardsPerTokenOut = _calculateRewardsPerToken();

    bool isChanged = accumulatedRewardsPerToken != rewardsPerTokenOut;

    if (isChanged) {
      stakingFees = 0;
    }

    accumulatedRewardsPerToken = rewardsPerTokenOut;

    emit RewardsPerTokenUpdated(rewardsPerTokenOut);

    return rewardsPerTokenOut;
  }

  function _updateUserRewards(address user) internal returns (UserRewards memory) {
    _updateRewardsPerToken();
    UserRewards memory userRewards_ = accumulatedRewards[user];

    // We skip the storage changes if already updated in the same block
    if (userRewards_.checkpoint == accumulatedRewardsPerToken) return userRewards_;

    // Calculate and update the new value user reserves.
    userRewards_.accumulated += _calculateUserRewards(
      userStake[user],
      userRewards_.checkpoint,
      accumulatedRewardsPerToken
    );

    userRewards_.checkpoint = accumulatedRewardsPerToken;

    accumulatedRewards[user] = userRewards_;
    emit UserRewardsUpdated(user, userRewards_.accumulated, userRewards_.checkpoint);

    return userRewards_;
  }

  /// @notice Stake tokens.
  function stake(uint256 amount) public virtual nonReentrant {
    address user = msg.sender;
    _updateUserRewards(user);
    totalStaked += amount;
    userStake[user] += amount;
    IERC20(stakingToken).safeTransferFrom(user, address(this), amount);
    emit Staked(user, amount);
  }

  /// @notice Unstake tokens.
  function unstake(uint256 amount) public virtual nonReentrant {
    address user = msg.sender;
    _updateUserRewards(user);
    totalStaked -= amount;
    userStake[user] -= amount;
    IERC20(stakingToken).safeTransfer(user, amount);
    emit Unstaked(user, amount);
  }

  /// @notice Claim all rewards for the caller.
  function claim() public virtual nonReentrant returns (uint256) {
    address user = msg.sender;
    _updateUserRewards(user);

    uint256 amount = accumulatedRewards[user].accumulated;
    accumulatedRewards[user].accumulated = 0;

    _safeTransferETH(user, amount);

    emit Claimed(user, amount);
    return amount;
  }

  function distribute() public virtual {
    _updateRewardsPerToken();
  }

  /// @notice Calculate and return current rewards per token.
  function currentRewardsPerToken() public view returns (uint256) {
    return _calculateRewardsPerToken();
  }

  /// @notice Calculate and return current rewards for a user.
  /// @dev This repeats the logic used on transactions, but doesn't update the storage.
  function currentUserRewards(address user) public view returns (uint256) {
    UserRewards memory accumulatedRewards_ = accumulatedRewards[user];

    uint256 currentAccumulatedRewardsPerToken = _calculateRewardsPerToken();

    uint256 rewards = accumulatedRewards_.accumulated +
      _calculateUserRewards(userStake[user], accumulatedRewards_.checkpoint, currentAccumulatedRewardsPerToken);

    return rewards;
  }

  function _safeTransferETH(address to, uint256 value) internal {
    (bool success, ) = to.call{ value: value }("");
    require(success, "ETH transfer failed");
  }
}
