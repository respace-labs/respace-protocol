// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IIndieX.sol";
import "./Token.sol";

contract Space is ERC1155Holder, ReentrancyGuard {
  using SafeERC20 for IERC20;

  uint256 public constant PER_TOKEN_PRECISION = 10 ** 18;
  string public name;
  string public symbol;
  address token;
  uint256 public creationId;
  uint256 public sponsorCreationId;

  uint256 public daoFeePercent = 0.5 ether; // 50%

  uint256 founderAccumulated = 0;

  uint256 public stakingFees = 0; // fee for rewards
  uint256 public daoFees = 0; // fee for rewards

  ERC20 public stakingToken; // Token to be staked
  uint256 public totalStaked; // Total amount staked
  mapping(address => uint256) public userStake; // Amount staked per user

  uint256 public accumulatedRewardsPerToken = 0;

  mapping(address => UserRewards) public accumulatedRewards; // Rewards accumulated per user

  event Staked(address user, uint256 amount);
  event Unstaked(address user, uint256 amount);
  event Claimed(address user, uint256 amount);
  event RewardsPerTokenUpdated(uint256 accumulated);
  event UserRewardsUpdated(address user, uint256 rewards, uint256 checkpoint);
  event Received(address sender, uint256 daoFee, uint256 stakingFee);

  struct SpaceInfo {
    string name;
    string symbol;
    address token;
    uint256 creationId;
    uint256 sponsorCreationId;
  }

  struct UserRewards {
    uint256 accumulated; // realized reward token amount
    // checkpoint to compare with RewardsPerToken.accumulated
    uint256 checkpoint;
  }

  address public immutable founder;

  constructor(address _founder) {
    founder = _founder;
  }

  modifier onlyFounder() {
    require(msg.sender == founder, "Only Founder");
    _;
  }

  fallback() external payable {}

  receive() external payable {
    uint256 fees = msg.value;
    uint256 daoFee = (fees * daoFeePercent) / 1 ether;
    uint256 stakingFee = fees - daoFee;
    daoFees += daoFee;
    stakingFees += stakingFee;
    emit Received(msg.sender, daoFee, stakingFees);
  }

  function setDaoFeePercent(uint256 _daoFeePercent) external onlyFounder {
    daoFeePercent = _daoFeePercent;
  }

  function withdrawExcessEth() external onlyFounder {
    _safeTransferETH(founder, daoFees);
    daoFees = 0;
  }

  function create(
    address indieX,
    string calldata _spaceName,
    string calldata _symbol,
    IIndieX.NewCreationInput memory creationInput,
    IIndieX.NewCreationInput memory sponsorCreationInput
  ) external {
    name = _spaceName;
    symbol = _symbol;

    Token _token = new Token(founder, _spaceName, _symbol);
    token = address(_token);

    stakingToken = _token;

    creationId = IIndieX(indieX).newCreation(creationInput);
    sponsorCreationId = IIndieX(indieX).newCreation(sponsorCreationInput);
  }

  function getInfo() external view returns (SpaceInfo memory) {
    return SpaceInfo(name, symbol, token, creationId, sponsorCreationId);
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
    _safeTransferETH(user, amount);

    accumulatedRewards[user].accumulated = 0;
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
