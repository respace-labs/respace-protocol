// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Token
struct BuyInfo {
  uint256 newX;
  uint256 newY;
  uint256 ethAmount;
  uint256 tokenAmountAfterFee;
  uint256 creatorFee;
  uint256 protocolFee;
}

struct SellInfo {
  uint256 newX;
  uint256 newY;
  uint256 ethAmount;
  uint256 tokenAmountAfterFee;
  uint256 creatorFee;
  uint256 protocolFee;
}

// Member
struct Plan {
  string uri;
  uint256 price;
  uint256 minEthAmount;
  bool isActive;
}

struct Subscription {
  uint8 planId;
  address account;
  uint256 startTime;
  uint256 duration;
  uint256 amount;
  string uri;
}

// Share
struct OrderInfo {
  uint256 orderId;
  address seller;
  uint256 amount;
  uint256 price;
}

struct Contributor {
  address account;
  uint256 shares;
  uint256 rewards;
  uint256 checkpoint;
}

struct VestingInfo {
  address beneficiary;
  address payer;
  uint256 start;
  uint256 duration;
  uint256 allocation;
  uint256 released;
}

// Staking
struct Staker {
  address account;
  uint256 staked;
  uint256 realized;
  uint256 checkpoint;
}

// Curator
struct CurationUser {
  address curator; // your curator
  uint256 rewards;
  uint256 memberCount;
  bool registered;
}

struct Tier {
  uint256 memberCountBreakpoint;
  uint256 rebateRate;
}

struct Config {
  string uri;
  uint256 stakingRevenuePercent;
  uint256 subscriptionFeePercent;
}

interface ISpace {
  function buy(uint256 minReturnAmount) external payable returns (BuyInfo memory);

  function sell(uint256 tokenAmount, uint256 minReturnAmount) external payable returns (SellInfo memory);

  // Member

  function createPlan(string calldata _uri, uint256 price, uint256 minEthAmount) external;

  function updatePlan(uint8 id, string calldata _uri, uint256 price, uint256 minEthAmount, bool isActive) external;

  function getPlans() external view returns (Plan[] memory);

  function subscribe(uint8 planId, uint256 amount, string calldata uri) external;

  function subscribeByEth(uint8 planId, string calldata uri) external payable;

  function unsubscribe(uint8 planId, uint256 amount) external;

  function distributeSubscriptionRewards(uint256 mintPastDuration) external;

  function distributeSingleSubscription(uint8 planId, address account) external;

  function getSubscription(uint8 planId, address account) external view returns (Subscription memory);

  function getSubscriptions() external view returns (Subscription[] memory);

  function calculateConsumedAmount(
    uint8 planId,
    address account,
    uint256 timestamp
  ) external view returns (uint256, uint256);

  // Share

  function addContributor(address account) external;

  function distributeShareRewards() external;

  function claimShareRewards() external returns (uint256 amount);

  function transferShares(address to, uint256 amount) external;

  function createShareOrder(uint256 amount, uint256 price) external returns (uint256 orderId);

  function cancelShareOrder(uint256 orderId) external;

  function executeShareOrder(uint256 orderId, uint256 amount) external payable;

  function getShareOrders() external view returns (OrderInfo[] memory);

  function getContributors() external view returns (Contributor[] memory);

  function currentContributorRewards(address account) external view returns (uint256);

  function addVesting(address beneficiary, uint256 startTime, uint256 duration, uint256 allocation) external;

  function claimVesting() external returns (uint256 amount);

  function removeVesting(address beneficiary) external;

  function getVestings() external view returns (VestingInfo[] memory);

  // Staking

  function currentUserRewards(address account) external view returns (uint256);

  function getStaker(address account) external view returns (Staker memory);

  function stake(uint256 amount) external;

  function unstake(uint256 amount) external;

  function claimStakingRewards() external returns (uint256 amount);

  // Curation

  function createCode(bytes32 _code) external;

  function updateCode(bytes32 _code) external;

  function bindCode(bytes32 _code) external;

  function getCurationUser(address account) external view returns (CurationUser memory);

  function getCurationUserByCode(bytes32 code) external view returns (CurationUser memory);

  function getCodeByCurator(address account) external view returns (bytes32);

  function getCuratorByCode(bytes32 code) external view returns (address);

  function updateTier(uint256 id, uint256 memberCountBreakpoint, uint256 rebateRate) external;

  function getTier(uint256 id) external view returns (Tier memory);

  function claimCurationRewards() external returns (uint256 rewards);

  // Others

  function updateConfig(string calldata uri, uint256 percent) external;

  function depositSpaceToken(uint256 amount) external;
}
