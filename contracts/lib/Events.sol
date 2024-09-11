// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library Events {
  /** SpaceFactory events */
  event SpaceCreated(
    uint256 indexed spaceId,
    address spaceAddress,
    address founder,
    string spaceName,
    string symbol,
    uint256 preBuyEthAmount
  );
  event PriceUpdated(uint256 price);
  event FeeReceiverUpdated(address receiver);
  event WithdrawEther(address indexed to, uint256 amount);
  event WithdrawToken(address indexed to, address token, uint256 amount);
  event Swap(address indexed account, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);

  /** App events */
  event AppCreated(uint256 id, address indexed creator, string uri, address feeReceiver, uint256 feePercent);
  event AppUpdated(uint256 id, address indexed creator, string uri, address feeReceiver, uint256 feePercent);

  /** space events */
  event StakingFeePercentUpdated(uint256 percent);
  event TokenDeposited(uint256 amount);

  /** Token events */
  event Trade(
    TradeType indexed tradeType,
    address indexed account,
    uint256 ethAmount,
    uint256 tokenAmount,
    uint256 creatorFee,
    uint256 protocolFee
  );

  enum TradeType {
    Buy,
    Sell
  }

  /** Staking events */
  event StakingEvent(StakingType indexed stakingType, address indexed account, uint256 amount);
  event StakingClaimed(address account, uint256 amount);
  event RewardsPerTokenUpdated(uint256 accumulated);
  event UserRewardsUpdated(address account, uint256 rewards, uint256 checkpoint);
  event YieldReleased(uint256 amount);

  enum StakingType {
    Stake,
    Unstake
  }

  /** Member events */
  event Subscribed(uint8 indexed planId, address indexed account, uint256 tokenAmount, uint256 duration);
  event Unsubscribed(uint8 indexed planId, address indexed account, uint256 tokenAmount, uint256 duration);
  event PlanCreated(uint8 indexed id, string uri, uint256 price, uint256 minEthAmount);
  event PlanUpdated(uint8 indexed id, string uri, uint256 price, uint256 minEthAmount);

  /** Share events */
  event RewardsPerShareUpdated(uint256 accumulated);
  event ShareRewardsClaimed(address account, uint256 amount);
  event SharesTransferred(address indexed from, address indexed to, uint256 amount);
  event ContributorAdded(address indexed account);
  event ShareOrderCreated(uint256 indexed orderId, address indexed seller, uint256 amount, uint256 price);
  event ShareOrderCanceled(uint256 indexed orderId, address indexed seller, uint256 amount, uint256 price);
  event ShareOrderExecuted(
    uint256 indexed orderId,
    address indexed seller,
    address buyer,
    uint256 amount,
    uint256 price
  );
  event VestingAdded(
    address indexed payer,
    address indexed beneficiary,
    uint256 start,
    uint256 duration,
    uint256 allocation
  );
  event VestingReleased(address indexed payer, address indexed beneficiary, uint256 amount);
}