// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../lib/TransferUtil.sol";

contract Share is ERC20, ERC20Permit, ReentrancyGuard {
  uint256 public immutable PER_SHARE_PRECISION = 10 ** 18;
  address public immutable founder;
  uint256 public daoFees = 0;
  uint256 public totalShare;
  uint256 public accumulatedRewardsPerShare = 0;

  mapping(address => Collaborator) public collaborators;

  address[] public collaboratorAddresses;

  struct UpsertCollaboratorInput {
    address account;
    uint256 share;
  }

  struct Collaborator {
    uint256 share;
    uint256 rewards; // realized rewards
    uint256 checkpoint;
  }

  event RewardsPerShareUpdated(uint256 accumulated);
  event Claimed(address user, uint256 amount);

  constructor(address _founder, string memory _name, string memory _symbol) ERC20(_name, _symbol) ERC20Permit(_name) {
    founder = _founder;
    collaborators[_founder] = Collaborator(100 * 1 ether, 0, 0);
  }

  modifier onlyFounder() {
    require(msg.sender == founder, "Only Founder");
    _;
  }

  fallback() external payable {}

  receive() external payable {}

  function withdrawDaoFee() external onlyFounder {
    TransferUtil.safeTransferETH(founder, daoFees);
    daoFees = 0;
  }

  function addCollaborator(UpsertCollaboratorInput calldata input) external onlyFounder {
    _updateRewardsPerShare();
    collaborators[input.account] = Collaborator(input.share, 0, 0);
  }

  function upsertCollaborators(UpsertCollaboratorInput[] calldata _collaborators) external onlyFounder {
    _updateRewardsPerShare();

    for (uint i = 0; i < _collaborators.length; i++) {
      address account = _collaborators[i].account;
      uint256 share = _collaborators[i].share;

      require(account != address(0), "Invalid address");
      require(share > 0, "Share must be positive");
      if (collaborators[account].share == 0) {
        collaborators[account] = Collaborator(0, 0, 0);
        collaboratorAddresses.push(account);
      }
      _updateCollaboratorRewards(account);

      collaborators[account].share = share;

      uint256 previousShare = collaborators[account].share;
      bool isAdd = share > previousShare;
      if (isAdd) {
        totalShare += (share - previousShare);
      } else {
        totalShare -= (previousShare - share);
      }
    }
  }

  function getCollaborators() public view returns (address[] memory, Collaborator[] memory) {
    Collaborator[] memory allCollaborators = new Collaborator[](collaboratorAddresses.length);
    for (uint256 i = 0; i < collaboratorAddresses.length; i++) {
      allCollaborators[i] = collaborators[collaboratorAddresses[i]];
    }
    return (collaboratorAddresses, allCollaborators);
  }

  function claim() public virtual nonReentrant returns (uint256) {
    address user = msg.sender;
    _updateCollaboratorRewards(user);

    uint256 amount = collaborators[user].rewards;
    collaborators[user].rewards = 0;

    TransferUtil.safeTransferETH(user, amount);

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
}
