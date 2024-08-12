// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IIndieX.sol";
import "./Token.sol";
import "./StakingRewards.sol";
import "hardhat/console.sol";

contract Space is ERC1155Holder, ReentrancyGuard {
  using SafeERC20 for IERC20;

  uint256 public immutable PER_SHARE_PRECISION = 10 ** 18;
  string public name;
  string public symbol;
  address token;
  address stakingRewards;
  uint256 public creationId;
  uint256 public sponsorCreationId;

  uint256 public daoFeePercent = 0.5 ether; // 50%

  uint256 founderAccumulated = 0;

  uint256 public stakingFees = 0; // fee for rewards
  uint256 public daoFees = 0; // fee for rewards

  struct SpaceInfo {
    string name;
    string symbol;
    address token;
    address stakingRewards;
    uint256 creationId;
    uint256 sponsorCreationId;
  }

  address public immutable founder;

  uint256 public totalShare;

  struct UpsertCollaboratorInput {
    address account;
    uint256 share;
  }

  uint256 public accumulatedRewardsPerShare = 0;

  struct Collaborator {
    uint256 share;
    uint256 rewards; // realized rewards
    uint256 checkpoint;
  }

  mapping(address => Collaborator) public collaborators;

  address[] private _collaboratorAddresses;

  event Claimed(address user, uint256 amount);
  event Received(address sender, uint256 daoFee, uint256 stakingFee);
  event RewardsPerShareUpdated(uint256 accumulated);

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
    _safeTransferETH(stakingRewards, stakingFee);
    emit Received(msg.sender, daoFee, stakingFee);
  }

  function setDaoFeePercent(uint256 _daoFeePercent) external onlyFounder {
    daoFeePercent = _daoFeePercent;
  }

  function withdrawDaoFee() external onlyFounder {
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

    StakingRewards _stakingRewards = new StakingRewards(token);
    stakingRewards = address(_stakingRewards);

    creationId = IIndieX(indieX).newCreation(creationInput);
    sponsorCreationId = IIndieX(indieX).newCreation(sponsorCreationInput);

    collaborators[founder] = Collaborator(100 * 1 ether, 0, 0);
  }

  function upsertCollaborators(UpsertCollaboratorInput[] calldata _collaborators) external onlyFounder {
    _updateRewardsPerShare();

    for (uint i = 0; i < _collaborators.length; i++) {
      address account = _collaborators[i].account;
      uint256 share = _collaborators[i].share;
      if (collaborators[account].share == 0) {
        collaborators[account] = Collaborator(0, 0, 0);
      }
      _updateCollaboratorRewards(account);

      collaborators[account].share = share;
      totalShare += share;
    }
  }

  function claim() public virtual nonReentrant returns (uint256) {
    address user = msg.sender;
    _updateCollaboratorRewards(user);

    uint256 amount = collaborators[user].rewards;
    collaborators[user].rewards = 0;

    _safeTransferETH(user, amount);

    emit Claimed(user, amount);
    return amount;
  }

  function distribute() public virtual {
    _updateRewardsPerShare();
  }

  function currentCollaboratorRewards(address user) public view returns (uint256) {
    Collaborator memory collaborator = collaborators[user];

    uint256 currentAccumulatedRewardsPerShare = _calculateRewardsPerShare();

    uint256 rewards = collaborator.rewards +
      _calculateCollaboratorRewards(collaborator.share, collaborator.checkpoint, currentAccumulatedRewardsPerShare);

    return rewards;
  }

  function getInfo() external view returns (SpaceInfo memory) {
    return SpaceInfo(name, symbol, token, stakingRewards, creationId, sponsorCreationId);
  }

  function _updateCollaboratorRewards(address user) internal {
    Collaborator memory _collaborator = collaborators[user];

    // We skip the storage changes if already updated in the same block
    if (_collaborator.checkpoint == accumulatedRewardsPerShare) {
      return;
    }

    // Calculate and update the new value user reserves.
    _collaborator.rewards += _calculateCollaboratorRewards(
      _collaborator.share,
      _collaborator.checkpoint,
      accumulatedRewardsPerShare
    );

    _collaborator.checkpoint = accumulatedRewardsPerShare;

    collaborators[user] = _collaborator;
  }

  function _updateRewardsPerShare() internal returns (uint256) {
    uint256 rewardsPerShareOut = _calculateRewardsPerShare();

    bool isChanged = accumulatedRewardsPerShare != rewardsPerShareOut;

    if (isChanged) {
      daoFees = 0;
    }

    accumulatedRewardsPerShare = rewardsPerShareOut;

    emit RewardsPerShareUpdated(rewardsPerShareOut);

    return rewardsPerShareOut;
  }

  function _calculateCollaboratorRewards(
    uint256 share,
    uint256 earlierCheckpoint,
    uint256 latterCheckpoint
  ) internal pure returns (uint256) {
    return (share * (latterCheckpoint - earlierCheckpoint)) / PER_SHARE_PRECISION;
  }

  function _calculateRewardsPerShare() internal view returns (uint256) {
    if (totalShare == 0) return accumulatedRewardsPerShare;
    return accumulatedRewardsPerShare + (PER_SHARE_PRECISION * daoFees) / totalShare;
  }

  function _safeTransferETH(address to, uint256 value) internal {
    (bool success, ) = to.call{ value: value }("");
    require(success, "ETH transfer failed");
  }
}
