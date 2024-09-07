// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
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

contract Space is ERC20, ERC20Permit, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.Bytes32Set;
  using EnumerableSet for EnumerableSet.UintSet;

  address public immutable factory;
  address public immutable founder;
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
  ) ERC20(_name, _symbol) ERC20Permit(_name) {
    appId = _appId;
    factory = _factory;
    founder = _founder;
  }

  modifier onlyFounder() {
    require(msg.sender == founder, "Only founder");
    _;
  }

  fallback() external payable {}

  receive() external payable {}

  function initialize() external {
    Share.addContributor(share, founder);
    share.contributors[founder].shares = SHARES_SUPPLY;

    Member.createPlan(member, "Member", DEFAULT_SUBSCRIPTION_PRICE);
    token = Token.State(Token.initialX, Token.initialY, Token.initialK);

    uint256 premintEth = 3.3333 ether;
    BuyInfo memory info = Token.buy(token, premintEth, 0);
    uint256 premint = info.tokenAmountAfterFee + info.creatorFee + info.protocolFee;
    staking.yieldAmount = premint;
    staking.yieldStartTime = block.timestamp;
    _mint(address(this), premint);
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
        info.protocolFee
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
        info.protocolFee
      );
    }
  }

  // ================member======================

  function createPlan(string calldata uri, uint256 price) external onlyFounder {
    Member.createPlan(member, uri, price);
  }

  function updatePlan(uint8 id, string memory uri, uint256 price, bool isActive) external onlyFounder {
    Member.updatePlan(member, id, uri, price, isActive);
  }

  function getPlans() external view returns (Member.Plan[] memory) {
    return Member.getPlans(member);
  }

  function subscribe(uint8 planId, uint256 amount) external nonReentrant {
    uint256 tokenPricePerSecond = Member.getTokenPricePerSecond(member, token, planId);
    uint256 durationFromAmount = amount / tokenPricePerSecond;
    (uint256 income, ) = Member.subscribe(member, subscriptionIds, planId, amount, durationFromAmount, true);
    if (income > 0) {
      uint256 fee = _chargeSubscriptionFee(income);
      _splitFee(fee);
    }
  }

  function subscribeByEth(uint8 planId) external payable nonReentrant {
    uint256 ethAmount = msg.value;
    BuyInfo memory info = Token.buy(token, ethAmount, 0);
    uint256 tokenPricePerSecond = Member.getTokenPricePerSecond(member, token, planId);
    uint256 durationByAmount = info.tokenAmountAfterFee / tokenPricePerSecond;
    (uint256 income, ) = Member.subscribe(
      member,
      subscriptionIds,
      planId,
      info.tokenAmountAfterFee,
      durationByAmount,
      false
    );
    _mint(address(this), info.tokenAmountAfterFee);

    if (income > 0) {
      uint256 fee = _chargeSubscriptionFee(income);
      _splitFee(fee);
    }
  }

  function unsubscribe(uint8 planId, uint256 amount) external nonReentrant {
    uint256 income = Member.unsubscribe(member, subscriptionIds, planId, amount);

    if (income > 0) {
      uint256 fee = _chargeSubscriptionFee(income);
      _splitFee(fee);
    }
  }

  function distributeSubscriptionRewards() external {
    bytes32[] memory ids = subscriptionIds.values();
    uint256 len = ids.length;

    for (uint256 i = 0; i < len; i++) {
      (uint256 income, ) = Member.distributeSingleSubscription(member, ids[i]);
      if (income > 0) {
        uint256 fee = _chargeSubscriptionFee(income);
        _splitFee(fee);
      }
    }
  }

  function distributeSingleSubscription(uint8 planId, address user) external {
    bytes32 id = keccak256(abi.encode(planId, user));
    (uint256 income, ) = Member.distributeSingleSubscription(member, id);

    if (income > 0) {
      uint256 fee = _chargeSubscriptionFee(income);
      _splitFee(fee);
    }
  }

  function getSubscriptions() external view returns (Member.Subscription[] memory) {
    return Member.getSubscriptions(member, subscriptionIds);
  }

  function calculateConsumedAmount(
    uint8 planId,
    address user,
    uint256 timestamp
  ) external view returns (uint256, uint256) {
    bytes32 id = keccak256(abi.encode(planId, user));
    return Member.calculateConsumedAmount(member, id, timestamp);
  }

  //================share=======================

  function addContributor(address account) external onlyFounder {
    Share.addContributor(share, account);
  }

  function distributeShareRewards() external {
    Share.distribute(share);
  }

  function claimShareRewards() external nonReentrant {
    Share.claimRewards(share);
  }

  function transferShares(address to, uint256 amount) external nonReentrant {
    Share.transferShares(share, to, amount);
  }

  function createShareOrder(uint256 amount, uint256 price) external nonReentrant returns (uint256) {
    return Share.createShareOrder(share, orderIds, amount, price);
  }

  function cancelShareOrder(uint256 orderId) external nonReentrant {
    Share.cancelShareOrder(share, orderIds, orderId);
  }

  function executeShareOrder(uint256 orderId, uint256 amount) external payable nonReentrant {
    Share.executeShareOrder(share, orderIds, orderId, amount);
  }

  function getShareOrders() external view returns (Share.Order[] memory) {
    return Share.getShareOrders(share, orderIds);
  }

  function getContributors() external view returns (Share.ContributorInfo[] memory) {
    return Share.getContributors(share);
  }

  function currentContributorRewards(address user) external view returns (uint256) {
    return Share.currentContributorRewards(share, user);
  }

  function addVesting(
    address beneficiary,
    uint256 startTime,
    uint256 duration,
    uint256 allocation
  ) external nonReentrant {
    Share.addVesting(share, vestingAddresses, beneficiary, startTime, duration, allocation);
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

  function currentUserRewards(address user) external view returns (uint256) {
    return Staking.currentUserRewards(staking, user);
  }

  function currentRewardsPerToken() external view returns (uint256) {
    return Staking.currentRewardsPerToken(staking);
  }

  function getStakers() external view returns (Staking.Staker[] memory) {
    return Staking.getStakers(staking, stakers);
  }

  function stake(uint256 amount) external nonReentrant {
    Staking.stake(staking, stakers, amount);
  }

  function unstake(uint256 amount) external nonReentrant {
    Staking.unstake(staking, stakers, amount);
  }

  function claimStakingRewards() external nonReentrant returns (uint256) {
    return Staking.claim(staking);
  }

  //============others===================

  function setStakingFeePercent(uint256 percent) external onlyFounder {
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
