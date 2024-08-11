// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IIndieX.sol";
import "./TokenFactory.sol";
import "hardhat/console.sol";

contract Space is Ownable, ERC1155Holder {
  using Cast for uint256;
  using SafeERC20 for IERC20;

  string public name;
  string public symbol;
  address token;
  uint256 public creationId;
  uint256 public sponsorCreationId;

  uint256 public stakingRewardPercent = 0.7 ether;

  event Staked(address user, uint256 amount);
  event Unstaked(address user, uint256 amount);
  event Claimed(address user, uint256 amount);
  event RewardsPerTokenUpdated(uint256 accumulated);
  event UserRewardsUpdated(address user, uint256 rewards, uint256 checkpoint);

  struct SpaceInfo {
    string name;
    string symbol;
    address token;
    uint256 creationId;
    uint256 sponsorCreationId;
  }

  struct RewardsPerToken {
    uint128 accumulated;
    uint128 lastUpdated;
  }

  struct UserRewards {
    uint128 accumulated; // realized reward per token
    uint128 checkpoint; // last time reward per token
  }

  uint128 founderAccumulated = 0;

  ERC20 public stakingToken; // Token to be staked
  uint256 public totalStaked; // Total amount staked
  mapping(address => uint256) public userStake; // Amount staked per user

  RewardsPerToken public rewardsPerToken; // Accumulator to track rewards per token
  mapping(address => UserRewards) public accumulatedRewards; // Rewards accumulated per user

  constructor(address initialOwner) Ownable(initialOwner) {}

  fallback() external payable {}

  receive() external payable {}

  function create(
    address indieX,
    string calldata _spaceName,
    string calldata _symbol,
    IIndieX.NewCreationInput memory creationInput,
    IIndieX.NewCreationInput memory sponsorCreationInput
  ) external {
    name = _spaceName;
    symbol = _symbol;

    TokenFactory _token = new TokenFactory(owner(), _spaceName, _symbol);
    token = address(_token);

    stakingToken = _token;

    creationId = IIndieX(indieX).newCreation(creationInput);
    sponsorCreationId = IIndieX(indieX).newCreation(sponsorCreationInput);

    console.log("===>>>>creationId:", creationId, "sponsorCreationId:", sponsorCreationId);

    console.log("token:", address(token));
  }

  function getInfo() external view returns (SpaceInfo memory) {
    return SpaceInfo(name, symbol, token, creationId, sponsorCreationId);
  }

  function _calculateRewardsPerToken(
    RewardsPerToken memory rewardsPerTokenIn
  ) internal view returns (RewardsPerToken memory) {
    RewardsPerToken memory rewardsPerTokenOut = RewardsPerToken(
      rewardsPerTokenIn.accumulated,
      rewardsPerTokenIn.lastUpdated
    );

    rewardsPerTokenOut.lastUpdated = block.timestamp.u128();

    if (totalStaked == 0) return rewardsPerTokenOut;

    uint256 ethBalance = address(this).balance;

    rewardsPerTokenOut.accumulated = (ethBalance / totalStaked).u128();
    return rewardsPerTokenOut;
  }

  /// @notice Calculate the rewards accumulated by a stake between two checkpoints.
  function _calculateUserRewards(
    uint256 stake_,
    uint256 earlierCheckpoint,
    uint256 latterCheckpoint
  ) internal pure returns (uint256) {
    return (stake_ * (latterCheckpoint - earlierCheckpoint)) / 1e18;
  }

  function _updateRewardsPerToken() internal returns (RewardsPerToken memory) {
    RewardsPerToken memory rewardsPerTokenIn = rewardsPerToken;
    RewardsPerToken memory rewardsPerTokenOut = _calculateRewardsPerToken(rewardsPerTokenIn);

    // We skip the storage changes if already updated in the same block
    if (rewardsPerTokenIn.lastUpdated == rewardsPerTokenOut.lastUpdated) return rewardsPerTokenOut;

    rewardsPerToken = rewardsPerTokenOut;
    emit RewardsPerTokenUpdated(rewardsPerTokenOut.accumulated);

    return rewardsPerTokenOut;
  }

  function _updateUserRewards(address user) internal returns (UserRewards memory) {
    RewardsPerToken memory rewardsPerToken_ = _updateRewardsPerToken();
    UserRewards memory userRewards_ = accumulatedRewards[user];

    // We skip the storage changes if already updated in the same block
    if (userRewards_.checkpoint == rewardsPerToken_.accumulated) return userRewards_;

    // Calculate and update the new value user reserves.
    userRewards_.accumulated += _calculateUserRewards(
      userStake[user],
      userRewards_.checkpoint,
      rewardsPerToken_.accumulated
    ).u128();
    userRewards_.checkpoint = rewardsPerToken_.accumulated;

    accumulatedRewards[user] = userRewards_;
    emit UserRewardsUpdated(user, userRewards_.accumulated, userRewards_.checkpoint);

    return userRewards_;
  }

  function _stake(address user, uint256 amount) internal {
    _updateUserRewards(user);
    totalStaked += amount;
    userStake[user] += amount;
    IERC20(stakingToken).safeTransferFrom(user, address(this), amount);
    emit Staked(user, amount);
  }

  function _unstake(address user, uint256 amount) internal {
    _updateUserRewards(user);
    totalStaked -= amount;
    userStake[user] -= amount;
    IERC20(stakingToken).safeTransfer(user, amount);
    emit Unstaked(user, amount);
  }

  /// @notice Claim rewards.
  function _claim(address user, uint256 amount) internal {
    uint256 rewardsAvailable = _updateUserRewards(msg.sender).accumulated;

    // This line would panic if the user doesn't have enough rewards accumulated
    accumulatedRewards[user].accumulated = (rewardsAvailable - amount).u128();

    // This line would panic if the contract doesn't have enough rewards tokens
    _safeTransferETH(user, amount);
    emit Claimed(user, amount);
  }

  /// @notice Stake tokens.
  function stake(uint256 amount) public virtual {
    _stake(msg.sender, amount);
  }

  /// @notice Unstake tokens.
  function unstake(uint256 amount) public virtual {
    _unstake(msg.sender, amount);
  }

  /// @notice Claim all rewards for the caller.
  function claim() public virtual returns (uint256) {
    uint256 claimed = _updateUserRewards(msg.sender).accumulated;
    _claim(msg.sender, claimed);
    return claimed;
  }

  /// @notice Calculate and return current rewards per token.
  function currentRewardsPerToken() public view returns (uint256) {
    return _calculateRewardsPerToken(rewardsPerToken).accumulated;
  }

  /// @notice Calculate and return current rewards for a user.
  /// @dev This repeats the logic used on transactions, but doesn't update the storage.
  function currentUserRewards(address user) public view returns (uint256) {
    UserRewards memory accumulatedRewards_ = accumulatedRewards[user];
    RewardsPerToken memory rewardsPerToken_ = _calculateRewardsPerToken(rewardsPerToken);
    return
      accumulatedRewards_.accumulated +
      _calculateUserRewards(userStake[user], accumulatedRewards_.checkpoint, rewardsPerToken_.accumulated);
  }

  function _safeTransferETH(address to, uint256 value) internal {
    (bool success, ) = to.call{ value: value }("");
    require(success, "ETH transfer failed");
  }
}

library Cast {
  function u128(uint256 x) internal pure returns (uint128 y) {
    require(x <= type(uint128).max, "Cast overflow");
    y = uint128(x);
  }
}
