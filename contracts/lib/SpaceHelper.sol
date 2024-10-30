// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/ISpaceFactory.sol";
import "../interfaces/ISpace.sol";
import "./Member.sol";
import "./Share.sol";
import "./Staking.sol";
import "./Curation.sol";
import "./Events.sol";
import "./Errors.sol";
import "./TransferUtil.sol";

library SpaceHelper {
  using SafeERC20 for IERC20;

  function initialize(
    Member.State storage member,
    Share.State storage share,
    Curation.State storage curation,
    Staking.State storage staking,
    Token.State storage token,
    address factory,
    address owner
  ) external returns (uint8 planId, uint256 premint) {
    if (msg.sender != factory) revert Errors.OnlyFactory();

    Share.addContributor(share, owner);

    share.contributors[owner].shares = SHARES_SUPPLY;

    Curation.initTiers(curation);

    planId = Member.createPlan(member, "", DEFAULT_SUBSCRIPTION_PRICE, DEFAULT_MIN_SUBSCRIPTION_AMOUNT);

    token.x = Token.initialX;
    token.y = Token.initialY;
    token.k = Token.initialK;

    BuyInfo memory info = Token.buy(token, PREMINT_ETH_AMOUNT, 0);

    premint = info.tokenAmountAfterFee + info.creatorFee + info.protocolFee;
    staking.yieldAmount = premint;
    staking.yieldStartTime = block.timestamp;
  }

  function swap(
    mapping(address => address) storage spaceToFounder,
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minTokenAmount
  ) external returns (uint256 returnAmount) {
    if (!isSpace(spaceToFounder, tokenIn) || !isSpace(spaceToFounder, tokenOut) || tokenIn == tokenOut) {
      revert Errors.InvalidTokens();
    }
    IERC20(address(tokenIn)).safeTransferFrom(msg.sender, address(this), amountIn);
    IERC20(address(tokenIn)).approve(tokenIn, amountIn);
    SellInfo memory sellInfo = ISpace(tokenIn).sell(amountIn, 0);
    BuyInfo memory buyInfo = ISpace(tokenOut).buy{ value: sellInfo.ethAmount }(minTokenAmount);
    returnAmount = buyInfo.tokenAmountAfterFee + buyInfo.creatorFee + buyInfo.protocolFee;
    IERC20(address(tokenOut)).transfer(msg.sender, returnAmount);
  }

  function withdrawEther(address feeReceiver) external returns (uint256 amount) {
    amount = address(this).balance;
    TransferUtil.safeTransferETH(feeReceiver, amount);
  }

  function withdrawTokens(address feeReceiver, address[] calldata tokens) external {
    for (uint256 i = 0; i < tokens.length; i++) {
      uint256 amount = IERC20(tokens[i]).balanceOf(address(this));
      IERC20(tokens[i]).transfer(feeReceiver, amount);
      emit Events.WithdrawToken(feeReceiver, tokens[i], amount);
    }
  }

  function isSpace(
    mapping(address => address) storage spaceToFounder,
    address spaceAddress
  ) public view returns (bool) {
    return spaceToFounder[spaceAddress] != address(0);
  }

  function sell(
    Token.State storage token,
    address factory,
    uint256 tokenAmount,
    uint256 minReturnAmount
  ) external returns (SellInfo memory info) {
    info = Token.sell(token, tokenAmount, minReturnAmount);
    if (address(this).balance <= info.ethAmount) revert Errors.TokenAmountTooLarge();

    IERC20(address(this)).transfer(factory, info.protocolFee);
    TransferUtil.safeTransferETH(msg.sender, info.ethAmount);
  }

  // deduct protocolFee and appFee
  function deductSubscriptionFees(
    Member.State storage member,
    address factory,
    uint256 appId,
    uint256 subscriptionFeePercent,
    uint256 revenue
  ) public returns (uint256 creatorRevenue) {
    uint256 appFee = 0;
    App memory app = ISpaceFactory(factory).getApp(appId);

    appFee = (revenue * app.feePercent) / 1 ether;
    uint256 protocolFee = (revenue * subscriptionFeePercent) / 1 ether;
    creatorRevenue = revenue - protocolFee - appFee;
    member.subscriptionIncome += creatorRevenue;
    IERC20(address(this)).transfer(factory, protocolFee);
    if (appFee > 0) {
      IERC20(address(this)).transfer(app.feeReceiver, appFee);
    }
  }

  function distributeCreatorRevenue(
    Staking.State storage staking,
    Share.State storage share,
    uint256 stakingRevenuePercent,
    uint256 creatorRevenue
  ) internal {
    if (staking.totalStaked > 0) {
      uint256 stakingRevenue = (creatorRevenue * stakingRevenuePercent) / 1 ether;
      uint256 daoRevenue = creatorRevenue - stakingRevenue;
      staking.stakingRevenue += stakingRevenue;
      share.daoRevenue += daoRevenue;
    } else {
      share.daoRevenue += creatorRevenue;
    }
  }

  function processSubscriptionRevenue(
    Member.State storage member,
    Share.State storage share,
    Curation.State storage curation,
    Staking.State storage staking,
    Config storage config,
    address factory,
    uint256 appId,
    uint256 revenue,
    address account
  ) external {
    if (revenue > 0) {
      uint256 creatorRevenue = deductSubscriptionFees(member, factory, appId, config.subscriptionFeePercent, revenue);

      CurationUser memory user = curation.users[account];

      if (user.curator != address(0)) {
        CurationUser storage curatorUser = curation.users[user.curator];
        uint256 rebateRate = Curation.getRebateRate(curation, curatorUser.memberCount);

        uint256 rewards = (creatorRevenue * rebateRate) / 1 ether;
        curatorUser.rewards += rewards;
        creatorRevenue = creatorRevenue - rewards;
      }

      SpaceHelper.distributeCreatorRevenue(staking, share, config.stakingRevenuePercent, creatorRevenue);
    }
  }
}
