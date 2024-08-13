// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IIndieX.sol";
import "../lib/TransferUtil.sol";
import "hardhat/console.sol";

library Share {
  uint256 public constant PER_SHARE_PRECISION = 10 ** 18;

  struct Collaborator {
    uint256 share;
    uint256 rewards; // realized rewards
    uint256 checkpoint;
  }

  struct UpsertCollaboratorInput {
    address account;
    uint256 share;
  }

  struct State {
    uint256 daoFees;
    uint256 totalShare;
    uint256 accumulatedRewardsPerShare;
    mapping(address => Collaborator) collaborators;
    address[] collaboratorAddresses;
  }

  event RewardsPerShareUpdated(uint256 accumulated);
  event Claimed(address user, uint256 amount);

  function addCollaborator(State storage self, UpsertCollaboratorInput calldata input) external {
    _updateRewardsPerShare(self);
    self.collaborators[input.account] = Collaborator(input.share, 0, 0);
  }

  function upsertCollaborators(State storage self, UpsertCollaboratorInput[] calldata _collaborators) external {
    _updateRewardsPerShare(self);

    for (uint i = 0; i < _collaborators.length; i++) {
      address account = _collaborators[i].account;
      uint256 share = _collaborators[i].share;

      require(account != address(0), "Invalid address");
      require(share > 0, "Share must be positive");
      if (self.collaborators[account].share == 0) {
        self.collaborators[account] = Collaborator(0, 0, 0);
        self.collaboratorAddresses.push(account);
      }
      _updateCollaboratorRewards(self, account);

      self.collaborators[account].share = share;

      uint256 previousShare = self.collaborators[account].share;
      bool isAdd = share > previousShare;
      if (isAdd) {
        self.totalShare += (share - previousShare);
      } else {
        self.totalShare -= (previousShare - share);
      }
    }
  }

  function getCollaborators(State storage self) public view returns (address[] memory, Collaborator[] memory) {
    Collaborator[] memory allCollaborators = new Collaborator[](self.collaboratorAddresses.length);
    for (uint256 i = 0; i < self.collaboratorAddresses.length; i++) {
      allCollaborators[i] = self.collaborators[self.collaboratorAddresses[i]];
    }
    return (self.collaboratorAddresses, allCollaborators);
  }

  function claim(State storage self) public returns (uint256) {
    address user = msg.sender;
    _updateCollaboratorRewards(self, user);

    uint256 amount = self.collaborators[user].rewards;
    self.collaborators[user].rewards = 0;

    TransferUtil.safeTransferETH(user, amount);

    emit Claimed(user, amount);
    return amount;
  }

  function distribute(State storage self) public {
    _updateRewardsPerShare(self);
  }

  function currentCollaboratorRewards(State storage self, address user) public view returns (uint256) {
    Collaborator memory collaborator = self.collaborators[user];

    uint256 currentAccumulatedRewardsPerShare = _calculateRewardsPerShare(self);

    uint256 rewards = collaborator.rewards +
      _calculateCollaboratorRewards(collaborator.share, collaborator.checkpoint, currentAccumulatedRewardsPerShare);

    return rewards;
  }

  function _updateCollaboratorRewards(State storage self, address user) internal {
    Collaborator memory _collaborator = self.collaborators[user];

    // We skip the storage changes if already updated in the same block
    if (_collaborator.checkpoint == self.accumulatedRewardsPerShare) {
      return;
    }

    // Calculate and update the new value user reserves.
    _collaborator.rewards += _calculateCollaboratorRewards(
      _collaborator.share,
      _collaborator.checkpoint,
      self.accumulatedRewardsPerShare
    );

    _collaborator.checkpoint = self.accumulatedRewardsPerShare;

    self.collaborators[user] = _collaborator;
  }

  function _updateRewardsPerShare(State storage self) internal returns (uint256) {
    uint256 rewardsPerShareOut = _calculateRewardsPerShare(self);

    bool isChanged = self.accumulatedRewardsPerShare != rewardsPerShareOut;

    if (isChanged) {
      self.daoFees = 0;
    }

    self.accumulatedRewardsPerShare = rewardsPerShareOut;

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

  function _calculateRewardsPerShare(State storage self) internal view returns (uint256) {
    if (self.totalShare == 0) return self.accumulatedRewardsPerShare;
    return self.accumulatedRewardsPerShare + (PER_SHARE_PRECISION * self.daoFees) / self.totalShare;
  }
}
