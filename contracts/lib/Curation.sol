// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";
import "./Events.sol";
import "./Errors.sol";
import "./TransferUtil.sol";

library Curation {
  struct Tier {
    uint256 memberCountBreakpoint;
    uint256 rebateRate;
  }

  struct User {
    address curator; // your curator
    uint256 rewards;
    uint256 memberCount; // member count in referredCount
    bool registered;
  }

  struct State {
    uint256 curatorCount;
    mapping(address => User) users;
    // @dev mapping of referral code to curator
    mapping(bytes32 => address) curators;
    // @dev mapping of curator to referral code
    mapping(address => bytes32) codes;
    // link between user <> tier
    mapping(address => bool) isActives;
    mapping(uint256 => Tier) tiers;
  }

  // create self invitation code
  function createCode(State storage self, bytes32 code) external {
    if (code == bytes32(0)) revert Errors.CodeIsEmpty();
    address account = msg.sender;
    if (self.codes[account] != bytes32(0)) revert Errors.CodeAlreadyExists();

    if (!self.users[account].registered) {
      self.users[account] = User(address(0), 0, 0, true);
    }
    self.codes[account] = code;
    self.curators[code] = account;
  }

  // update self invitation code
  function updateCode(State storage self, bytes32 code) external {
    if (code == bytes32(0)) revert Errors.CodeIsEmpty();
    if (self.codes[msg.sender] == bytes32(0)) revert Errors.ShouldCreateCodeFirstly();

    if (self.curators[code] != address(0)) revert Errors.CodeIsUsed();

    bytes32 prevCode = self.codes[msg.sender];
    self.curators[code] = msg.sender;
    self.codes[msg.sender] = code;
    delete self.curators[prevCode];
  }

  // bind code
  function bindCode(State storage self, bytes32 code) external {
    if (code == bytes32(0)) revert Errors.CodeIsEmpty();
    if (self.curators[code] == address(0)) revert Errors.CodeNotExists();
    if (self.codes[msg.sender] == code || self.curators[code] == msg.sender) {
      revert Errors.CannotInviteYourself();
    }

    address curator = self.curators[code];

    User storage me = self.users[msg.sender];
    if (me.curator != address(0)) revert Errors.UserIsInvited();

    if (!me.registered) {
      me.registered = true;
    }
    me.curator = curator;
  }

  function increaseMemberCount(State storage self, address invitee) external {
    User memory inviteeUser = self.users[invitee];
    if (inviteeUser.curator != address(0)) {
      self.users[inviteeUser.curator].memberCount += 1;
    }
  }

  function decreaseMemberCount(State storage self, address invitee) external {
    User memory inviteeUser = self.users[invitee];
    if (inviteeUser.curator != address(0)) {
      self.users[inviteeUser.curator].memberCount -= 1;
    }
  }

  function getUser(State storage self, address account) external view returns (User memory) {
    return self.users[account];
  }

  function getUserByCode(State storage self, bytes32 code) external view returns (User memory) {
    return self.users[self.curators[code]];
  }

  function getCodeByCurator(State storage self, address curator) external view returns (bytes32) {
    return self.codes[curator];
  }

  function getCuratorByCode(State storage self, bytes32 code) external view returns (address) {
    return self.curators[code];
  }

  function initTiers(State storage self) external {
    self.tiers[0].memberCountBreakpoint = 10;
    self.tiers[0].rebateRate = 0.1 ether; // 10%

    self.tiers[1].memberCountBreakpoint = 20;
    self.tiers[1].rebateRate = 0.2 ether; // 20%

    self.tiers[2].memberCountBreakpoint = 40;
    self.tiers[2].rebateRate = 0.4 ether; // 40%
  }

  function updateTier(State storage self, uint256 id, uint256 memberCountBreakpoint, uint256 rebateRate) external {
    self.tiers[id].memberCountBreakpoint = memberCountBreakpoint;
    self.tiers[id].rebateRate = rebateRate;
  }

  function getTier(State storage self, uint256 id) external view returns (Tier memory) {
    return self.tiers[id];
  }

  function getRebateRate(State storage self, uint256 memberCount) external view returns (uint256) {
    Tier memory tier0 = self.tiers[0];
    if (memberCount <= tier0.memberCountBreakpoint) {
      return tier0.rebateRate;
    }

    Tier memory tier1 = self.tiers[1];
    if (memberCount <= tier1.memberCountBreakpoint) {
      return tier1.rebateRate;
    }
    return self.tiers[2].rebateRate;
  }

  function claimRewards(State storage self) external returns (uint256 rewards) {
    User storage user = self.users[msg.sender];
    if (user.rewards > 0) {
      IERC20(address(this)).transfer(msg.sender, user.rewards);
      rewards = user.rewards;
      user.rewards = 0;
    }
  }
}
