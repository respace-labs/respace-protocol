// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./lib/TransferUtil.sol";
import "./lib/Share.sol";
import "./lib/Staking.sol";
import "./lib/Member.sol";
import "./lib/Token.sol";
import "./lib/Events.sol";
import "./lib/Constants.sol";
import "./interfaces/ISpace.sol";
import "./interfaces/ISpaceFactory.sol";
import "hardhat/console.sol";

contract Space is ERC20, ERC20Permit, Ownable, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.Bytes32Set;
  using EnumerableSet for EnumerableSet.UintSet;

  address public immutable factory;
  uint256 public immutable appId;

  // fee
  uint256 public stakingFeePercent = 0.3 ether; // 30% default

  uint256 public subscriptionFeePercent = 0.02 ether; // 2% to protocol

  uint256 public totalFee;

  // token
  Token.State public token;

  // share
  Share.State public share;

  // staking
  Staking.State public staking;

  // subscription
  Member.State public member;

  /**  Sets */
  EnumerableSet.Bytes32Set subscriptionIds;
  EnumerableSet.AddressSet stakers;
  EnumerableSet.UintSet orderIds;
  EnumerableSet.AddressSet vestingAddresses;

  constructor(
    uint256 _appId,
    address _factory,
    address _founder,
    string memory _name,
    string memory _symbol
  ) ERC20(_name, _symbol) ERC20Permit(_name) Ownable(_founder) {
    appId = _appId;
    factory = _factory;
  }

  fallback() external payable {}

  receive() external payable {}

  function initialize() external {
    require(msg.sender == factory, "Only factory can initialize");
    Share.addContributor(share, owner());
    share.contributors[owner()].shares = SHARES_SUPPLY;

    uint8 planId = Member.createPlan(member, "Member", DEFAULT_SUBSCRIPTION_PRICE, DEFAULT_MIN_SUBSCRIPTION_AMOUNT);

    emit Events.PlanCreated(planId, "Member", DEFAULT_SUBSCRIPTION_PRICE, 0);

    token = Token.State(Token.initialX, Token.initialY, Token.initialK);

    uint256 premintEth = 3.3333 ether;
    BuyInfo memory info = Token.buy(token, premintEth, 0);

    uint256 premint = info.tokenAmountAfterFee + info.creatorFee + info.protocolFee;
    staking.yieldAmount = premint;
    staking.yieldStartTime = block.timestamp;
    _mint(address(this), premint);
  }

  function updateSpaceInfo(
    string calldata logo,
    string calldata name,
    string calldata description,
    string calldata about
  ) external onlyOwner {
    emit Events.SpaceInfoUpdated(logo, name, description, about);
  }

  function buy(uint256 minTokenAmount) external payable nonReentrant returns (BuyInfo memory info) {
    bool isSwap = msg.sender == factory;
    info = Token.buy(token, msg.value, minTokenAmount);
    if (isSwap) {
      _mint(msg.sender, info.tokenAmountAfterFee + info.creatorFee + info.protocolFee);
    } else {
      _splitFee(info.creatorFee);
      _mint(msg.sender, info.tokenAmountAfterFee);
      _mint(address(this), info.creatorFee);
      _mint(factory, info.protocolFee);

      emit Events.Trade(
        Events.TradeType.Buy,
        msg.sender,
        info.ethAmount,
        info.tokenAmountAfterFee,
        info.creatorFee,
        info.protocolFee,
        IERC20(address(this)).balanceOf(msg.sender)
      );
    }
  }

  function sell(
    uint256 tokenAmount,
    uint256 minEthAmount
  ) external payable nonReentrant returns (SellInfo memory info) {
    bool isSwap = msg.sender == factory;
    info = Token.sell(token, tokenAmount, minEthAmount);

    require(address(this).balance > info.ethAmount, "Token amount to large");

    _splitFee(info.creatorFee);
    _burn(address(this), info.tokenAmountAfterFee);

    IERC20(address(this)).transfer(factory, info.protocolFee);

    TransferUtil.safeTransferETH(msg.sender, info.ethAmount);

    if (!isSwap) {
      emit Events.Trade(
        Events.TradeType.Sell,
        msg.sender,
        info.ethAmount,
        tokenAmount,
        info.creatorFee,
        info.protocolFee,
        IERC20(address(this)).balanceOf(msg.sender)
      );
    }
  }

  // ================member======================

  function createPlan(string calldata uri, uint256 price, uint256 minEthAmount) external onlyOwner {
    uint8 id = Member.createPlan(member, uri, price, minEthAmount);
    emit Events.PlanCreated(id, uri, price, minEthAmount);
  }

  function updatePlan(
    uint8 id,
    string calldata uri,
    uint256 price,
    uint256 minEthAmount,
    bool isActive
  ) external onlyOwner {
    Member.updatePlan(member, id, uri, price, minEthAmount, isActive);
    emit Events.PlanUpdated(id, uri, price, minEthAmount);
  }

  function updatePlanBenefits(uint8 id, string calldata benefits) external onlyOwner {
    emit Events.PlanBenefitsUpdated(id, benefits);
  }

  function getPlans() external view returns (Member.Plan[] memory) {
    return Member.getPlans(member);
  }

  function subscribe(uint8 planId, uint256 amount) external nonReentrant {
    require(amount > 0, "Amount must be greater than zero");

    // Calculate the ETH equivalent amount without fees
    uint256 ethAmount = Token.getEthAmountWithoutFee(token, amount);
    IERC20(address(this)).safeTransferFrom(msg.sender, address(this), amount);

    (uint256 currentDuration, uint256 income, ) = Member.subscribe(member, subscriptionIds, planId, ethAmount, amount);
    _handleSubscriptionIncome(income);

    emit Events.Subscribed(planId, msg.sender, amount, currentDuration);
  }

  function subscribeByEth(uint8 planId) external payable nonReentrant {
    uint256 ethAmount = msg.value;
    require(ethAmount > 0, "ETH amount must be greater than zero");

    // Purchase tokens using the provided ETH amount
    BuyInfo memory info = Token.buy(token, ethAmount, 0);
    _mint(address(this), info.tokenAmountAfterFee);

    (uint256 currentDuration, uint256 income, ) = Member.subscribe(
      member,
      subscriptionIds,
      planId,
      ethAmount,
      info.tokenAmountAfterFee
    );
    _handleSubscriptionIncome(income);

    emit Events.Subscribed(planId, msg.sender, info.tokenAmountAfterFee, currentDuration);
  }

  function unsubscribe(uint8 planId, uint256 amount) external nonReentrant {
    (uint256 income, uint256 unsubscribeAmount, uint256 unsubscribeDuration) = Member.unsubscribe(
      member,
      subscriptionIds,
      planId,
      amount
    );

    _handleSubscriptionIncome(income);

    emit Events.Unsubscribed(planId, msg.sender, unsubscribeAmount, unsubscribeDuration);
  }

  function distributeSubscriptionRewards() external {
    bytes32[] memory ids = subscriptionIds.values();
    uint256 len = ids.length;

    for (uint256 i = 0; i < len; i++) {
      (uint256 income, ) = Member.distributeSingleSubscription(member, ids[i]);
      _handleSubscriptionIncome(income);
    }
  }

  function distributeSingleSubscription(uint8 planId, address account) external {
    bytes32 id = Member.generateSubscriptionId(planId, account);
    (uint256 income, ) = Member.distributeSingleSubscription(member, id);
    _handleSubscriptionIncome(income);
  }

  function getSubscriptions() external view returns (Member.Subscription[] memory) {
    return Member.getSubscriptions(member, subscriptionIds);
  }

  function calculateConsumedAmount(
    uint8 planId,
    address account,
    uint256 timestamp
  ) external view returns (uint256, uint256) {
    bytes32 id = Member.generateSubscriptionId(planId, account);
    return Member.calculateConsumedAmount(member, id, timestamp);
  }

  function _handleSubscriptionIncome(uint256 income) private {
    if (income > 0) {
      uint256 fee = _chargeSubscriptionFee(income);
      _splitFee(fee);
    }
  }

  //================share=======================

  function addContributor(address account) external onlyOwner {
    Share.addContributor(share, account);
    emit Events.ContributorAdded(account);
  }

  function distributeShareRewards() external {
    Share.distribute(share);
  }

  function claimShareRewards() external nonReentrant {
    uint256 amount = Share.claimRewards(share);
    emit Events.ShareRewardsClaimed(msg.sender, amount);
  }

  function transferShares(address to, uint256 amount) external nonReentrant {
    Share.transferShares(share, to, amount);
    emit Events.SharesTransferred(msg.sender, to, amount);
  }

  function createShareOrder(uint256 amount, uint256 price) external nonReentrant returns (uint256) {
    return Share.createShareOrder(share, orderIds, amount, price);
  }

  function cancelShareOrder(uint256 orderId) external nonReentrant {
    Share.cancelShareOrder(share, orderIds, orderId);
  }

  function executeShareOrder(uint256 orderId, uint256 amount) external payable nonReentrant {
    (address seller, uint256 price) = Share.executeShareOrder(share, orderIds, orderId, amount);
    emit Events.ShareOrderExecuted(orderId, seller, msg.sender, amount, price);
  }

  function getShareOrders() external view returns (Share.Order[] memory) {
    return Share.getShareOrders(share, orderIds);
  }

  function getContributors() external view returns (Share.ContributorInfo[] memory) {
    return Share.getContributors(share);
  }

  function currentContributorRewards(address account) external view returns (uint256) {
    return Share.currentContributorRewards(share, account);
  }

  function addVesting(
    address beneficiary,
    uint256 startTime,
    uint256 duration,
    uint256 allocation
  ) external nonReentrant {
    Share.addVesting(share, vestingAddresses, beneficiary, startTime, duration, allocation);
    emit Events.VestingAdded(msg.sender, beneficiary, startTime, duration, allocation);
  }

  function claimVesting() external nonReentrant {
    Share.claimVesting(share);
  }

  function removeVesting(address beneficiary) external nonReentrant {
    Share.removeVesting(share, vestingAddresses, beneficiary);
  }

  function getVestings() external view returns (Share.VestingInfo[] memory) {
    return Share.getVestings(share, vestingAddresses);
  }

  //================staking=======================

  function currentUserRewards(address account) external view returns (uint256) {
    return Staking.currentUserRewards(staking, account);
  }

  function currentRewardsPerToken() external view returns (uint256) {
    return Staking.currentRewardsPerToken(staking);
  }

  function getStakers() external view returns (Staking.Staker[] memory) {
    return Staking.getStakers(staking, stakers);
  }

  function stake(uint256 amount) external nonReentrant {
    Staking.stake(staking, stakers, amount);
    emit Events.StakingEvent(Events.StakingType.Stake, msg.sender, amount);
  }

  function unstake(uint256 amount) external nonReentrant {
    Staking.unstake(staking, stakers, amount);
    emit Events.StakingEvent(Events.StakingType.Unstake, msg.sender, amount);
  }

  function claimStakingRewards() external nonReentrant returns (uint256 amount) {
    amount = Staking.claim(staking);
    emit Events.StakingClaimed(msg.sender, amount);
  }

  //============others===================

  function setStakingFeePercent(uint256 percent) external onlyOwner {
    require(percent >= 0.01 ether, "Staking fee percent must be >= 10%");
    stakingFeePercent = percent;
    emit Events.StakingFeePercentUpdated(percent);
  }

  function depositToken(uint256 amount) external nonReentrant {
    share.daoFee += amount;
    IERC20(address(this)).safeTransferFrom(msg.sender, address(this), amount);
    emit Events.TokenDeposited(amount);
  }

  function _splitFee(uint256 fee) internal {
    if (staking.totalStaked > 0) {
      uint256 feeToStaking = (fee * stakingFeePercent) / 1 ether;
      staking.stakingFee += feeToStaking;
      share.daoFee += (fee - feeToStaking);
      totalFee += fee;
    } else {
      share.daoFee += fee;
      totalFee += fee;
    }
  }

  // charge protocolFee and appFee
  function _chargeSubscriptionFee(uint256 income) internal returns (uint256 creatorFee) {
    uint256 appFee = 0;
    App memory app = ISpaceFactory(factory).getApp(appId);
    if (app.creator != address(0) && app.feeReceiver != address(0)) {
      app = ISpaceFactory(factory).getApp(0); // use default app
    }

    appFee = (income * app.feePercent) / 1 ether;
    uint256 protocolFee = (income * subscriptionFeePercent) / 1 ether;
    creatorFee = income - protocolFee - appFee;
    member.subscriptionIncome += creatorFee;
    IERC20(address(this)).transfer(factory, protocolFee);
    if (appFee > 0) {
      IERC20(address(this)).transfer(app.feeReceiver, appFee);
    }
  }
}
