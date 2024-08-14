// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IIndieX.sol";
import "../lib/TransferUtil.sol";
import "hardhat/console.sol";

library Share {
  uint256 public constant PER_SHARE_PRECISION = 10 ** 18;

  struct Contributor {
    uint256 share;
    uint256 rewards; // realized rewards
    uint256 checkpoint;
  }

  struct UpsertContributorInput {
    address account;
    uint256 share;
  }

  struct ContributorInfo {
    address account;
    uint256 share;
  }

  struct State {
    uint256 daoFees;
    uint256 totalShare;
    uint256 accumulatedRewardsPerShare;
    mapping(address => Contributor) contributors;
    address[] contributorAddresses;
  }

  event RewardsPerShareUpdated(uint256 accumulated);
  event Claimed(address user, uint256 amount);

  function addContributor(State storage self, UpsertContributorInput calldata input) external {
    _updateRewardsPerShare(self);
    self.contributors[input.account] = Contributor(input.share, 0, 0);
    self.contributorAddresses.push(input.account);
    self.totalShare += input.share;
  }

  function upsertContributors(State storage self, UpsertContributorInput[] calldata _contributors) external {
    _updateRewardsPerShare(self);

    for (uint i = 0; i < _contributors.length; i++) {
      address account = _contributors[i].account;
      uint256 share = _contributors[i].share;

      require(account != address(0), "Invalid address");
      require(share > 0, "Share must be positive");
      if (self.contributors[account].share == 0) {
        self.contributors[account] = Contributor(0, 0, 0);
        self.contributorAddresses.push(account);
      }
      _updateContributorRewards(self, account);

      self.contributors[account].share = share;

      uint256 previousShare = self.contributors[account].share;
      bool isAdd = share > previousShare;
      if (isAdd) {
        self.totalShare += (share - previousShare);
      } else {
        self.totalShare -= (previousShare - share);
      }
    }
  }

  function getContributors(State storage self) public view returns (ContributorInfo[] memory) {
    ContributorInfo[] memory info = new ContributorInfo[](self.contributorAddresses.length);
    for (uint256 i = 0; i < self.contributorAddresses.length; i++) {
      info[i] = ContributorInfo(self.contributorAddresses[i], self.contributors[self.contributorAddresses[i]].share);
    }
    return info;
  }

  function claim(State storage self) public returns (uint256) {
    address user = msg.sender;
    _updateRewardsPerShare(self);
    _updateContributorRewards(self, user);

    uint256 amount = self.contributors[user].rewards;
    self.contributors[user].rewards = 0;

    TransferUtil.safeTransferETH(user, amount);

    emit Claimed(user, amount);
    return amount;
  }

  function distribute(State storage self) public {
    _updateRewardsPerShare(self);
  }

  function currentContributorRewards(State storage self, address user) public view returns (uint256) {
    Contributor memory contributor = self.contributors[user];

    uint256 currentAccumulatedRewardsPerShare = _calculateRewardsPerShare(self);

    uint256 rewards = contributor.rewards +
      _calculateContributorRewards(contributor.share, contributor.checkpoint, currentAccumulatedRewardsPerShare);

    return rewards;
  }

  function _updateContributorRewards(State storage self, address user) internal {
    Contributor memory _contributor = self.contributors[user];

    // We skip the storage changes if already updated in the same block
    if (_contributor.checkpoint == self.accumulatedRewardsPerShare) {
      return;
    }

    // Calculate and update the new value user reserves.
    _contributor.rewards += _calculateContributorRewards(
      _contributor.share,
      _contributor.checkpoint,
      self.accumulatedRewardsPerShare
    );

    _contributor.checkpoint = self.accumulatedRewardsPerShare;

    self.contributors[user] = _contributor;
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

  function _calculateContributorRewards(
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
