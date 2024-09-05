// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./lib/TransferUtil.sol";
import "./lib/Share.sol";
import "./lib/Staking.sol";
import "./lib/Member.sol";
import "./lib/Token.sol";
import "./interfaces/ISpace.sol";
import "hardhat/console.sol";

contract Space is ERC20, ERC20Permit, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using Math for uint256;
  using EnumerableSet for EnumerableSet.Bytes32Set;
  using EnumerableSet for EnumerableSet.UintSet;

  address public immutable factory;
  address public immutable founder;
  uint256 public immutable preBuyEthAmount;

  // fee
  uint256 public stakingFeePercent = 0.3 ether; // 30%
  uint256 public subscriptionFeePercent = 0.05 ether; // 5% to protocol

  uint256 totalFee;

  // token
  Token.State public token;

  // share
  Share.State share;

  // staking
  Staking.State staking;

  // subscription
  Member.State member;

  struct SpaceInfo {
    string name;
    string symbol;
    address founder;
    /** token */
    uint256 x;
    uint256 y;
    uint256 k;
    /** fee */
    uint256 totalFee;
    uint256 daoFee;
    uint256 stakingFee;
    /** member */
    uint8 planIndex;
    uint256 subscriptionIndex;
    uint256 subscriptionIncome;
    /** staking */
    uint256 yieldStartTime;
    uint256 yieldAmount;
    uint256 yieldReleased;
    uint256 totalStaked;
    uint256 accumulatedRewardsPerToken;
    /** share */
    uint256 accumulatedRewardsPerShare;
    uint256 orderIndex;
    uint256[] orderIds;
  }

  event StakingFeePercentUpdated(uint256 percent);
  event TokenDeposited(uint256 amount);

  constructor(
    address _factory,
    address _founder,
    string memory _name,
    string memory _symbol,
    uint256 _preBuyEthAmount
  ) ERC20(_name, _symbol) ERC20Permit(_name) {
    factory = _factory;
    founder = _founder;
    preBuyEthAmount = _preBuyEthAmount;
  }

  modifier onlyFounder() {
    require(msg.sender == founder, "Only founder");
    _;
  }

  fallback() external payable {}

  receive() external payable {}

  function initialize() external {
    Share.addContributor(share, founder);
    share.contributors[founder].shares = Share.SHARES_SUPPLY;

    Member.createPlan(member, "Member", Member.DEFAULT_SUBSCRIPTION_PRICE);
    token = Token.State(Token.initialX, Token.initialY, Token.initialK);

    uint256 premintEth = 30 ether;
    BuyInfo memory info = Token.buy(token, premintEth, 0);
    uint256 premint = info.tokenAmountAfterFee + info.creatorFee + info.protocolFee;
    staking.yieldAmount = premint;
    staking.yieldStartTime = block.timestamp;
    _mint(address(this), premint);
  }

  function getTokenAmount(uint256 ethAmount) public view returns (BuyInfo memory) {
    return Token.getTokenAmount(token, ethAmount);
  }

  function getEthAmount(uint256 tokenAmount) public view returns (SellInfo memory) {
    return Token.getEthAmount(token, tokenAmount);
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

      emit Token.Trade(
        Token.TradeType.Buy,
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

    _splitFee(info.creatorFee);
    _burn(address(this), info.tokenAmountAfterFee);

    IERC20(address(this)).transfer(factory, info.protocolFee);
    TransferUtil.safeTransferETH(msg.sender, info.ethAmount);

    if (!isSwap) {
      emit Token.Trade(
        Token.TradeType.Sell,
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

  function setPlanURI(uint8 id, string calldata uri) external onlyFounder {
    Member.setPlanURI(member, id, uri);
  }

  function setPlanPrice(uint8 id, uint256 price) external onlyFounder {
    Member.setPlanPrice(member, id, price);
  }

  function setPlanStatus(uint8 id, bool isActive) external onlyFounder {
    Member.setPlanStatus(member, id, isActive);
  }

  function getPlan(uint8 id) external view returns (Member.Plan memory) {
    return Member.getPlan(member, id);
  }

  function getPlans() external view returns (Member.Plan[] memory) {
    return Member.getPlans(member);
  }

  function getTokenPricePerSecond(uint8 planId) public view returns (uint256) {
    Member.Plan memory plan = member.plans[planId];
    uint256 ethPricePerSecond = plan.price / Member.SECONDS_PER_MONTH;
    BuyInfo memory info = Token.getTokenAmount(token, ethPricePerSecond);
    return info.tokenAmountAfterFee;
  }

  function subscribe(uint8 planId, uint256 amount) external nonReentrant {
    uint256 tokenPricePerSecond = getTokenPricePerSecond(planId);
    uint256 durationFromAmount = amount / tokenPricePerSecond;
    (uint256 income, ) = Member.subscribe(member, planId, amount, durationFromAmount, true);
    if (income > 0) {
      uint256 fee = _chargeSubscriptionProtocolFee(income);
      _splitFee(fee);
    }
  }

  function subscribeByEth(uint8 planId) external payable nonReentrant {
    uint256 ethAmount = msg.value;
    BuyInfo memory info = Token.buy(token, ethAmount, 0);
    uint256 tokenPricePerSecond = getTokenPricePerSecond(planId);
    uint256 durationByAmount = info.tokenAmountAfterFee / tokenPricePerSecond;
    (uint256 income, ) = Member.subscribe(member, planId, info.tokenAmountAfterFee, durationByAmount, false);
    _mint(address(this), info.tokenAmountAfterFee);

    if (income > 0) {
      uint256 fee = _chargeSubscriptionProtocolFee(income);
      _splitFee(fee);
    }
  }

  function unsubscribe(uint8 planId, uint256 amount) external nonReentrant {
    uint256 income = Member.unsubscribe(member, planId, amount);

    if (income > 0) {
      uint256 fee = _chargeSubscriptionProtocolFee(income);
      _splitFee(fee);
    }
  }

  function distributeSubscriptionRewards() external {
    bytes32[] memory ids = member.subscriptionIds.values();
    uint256 len = ids.length;

    for (uint256 i = 0; i < len; i++) {
      (uint256 income, ) = Member.distributeSingleSubscription(member, ids[i]);
      if (income > 0) {
        uint256 fee = _chargeSubscriptionProtocolFee(income);
        _splitFee(fee);
      }
    }
  }

  function distributeSingleSubscription(uint8 planId, address user) external {
    bytes32 id = keccak256(abi.encode(planId, user));
    (uint256 income, ) = Member.distributeSingleSubscription(member, id);

    if (income > 0) {
      uint256 fee = _chargeSubscriptionProtocolFee(income);
      _splitFee(fee);
    }
  }

  function getSubscription(uint8 planId, address user) external view returns (Member.Subscription memory) {
    return Member.getSubscription(member, planId, user);
  }

  function getSubscriptions() external view returns (Member.Subscription[] memory) {
    return Member.getSubscriptions(member);
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
    return Share.createShareOrder(share, amount, price);
  }

  function cancelShareOrder(uint256 orderId) external nonReentrant {
    Share.cancelShareOrder(share, orderId);
  }

  function executeShareOrder(uint256 orderId, uint256 amount) external payable nonReentrant {
    Share.executeShareOrder(share, orderId, amount);
  }

  function getShareOrders() external view returns (Share.Order[] memory) {
    return Share.getShareOrders(share);
  }

  function getContributor(address account) external view returns (Share.Contributor memory) {
    return Share.getContributor(share, account);
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
    Share.addVesting(share, beneficiary, startTime, duration, allocation);
  }

  function claimVesting() external nonReentrant {
    Share.claimVesting(share);
  }

  function removeVesting(address beneficiary) external nonReentrant {
    Share.removeVesting(share, beneficiary);
  }

  function vestedAmount(address beneficiary, uint256 timestamp) external view returns (uint256) {
    return Share.vestedAmount(share, beneficiary, timestamp);
  }

  function getVestings() external view returns (Share.VestingInfo[] memory) {
    return Share.getVestings(share);
  }

  //================staking=======================

  function currentUserRewards(address user) external view returns (uint256) {
    return Staking.currentUserRewards(staking, user);
  }

  function currentRewardsPerToken() external view returns (uint256) {
    return Staking.currentRewardsPerToken(staking);
  }

  function getStakers() external view returns (Staking.Staker[] memory) {
    return Staking.getStakers(staking);
  }

  function stake(uint256 amount) external nonReentrant {
    Staking.stake(staking, amount);
  }

  function unstake(uint256 amount) external nonReentrant {
    Staking.unstake(staking, amount);
  }

  function claimStakingRewards() external nonReentrant returns (uint256) {
    return Staking.claim(staking);
  }

  //============others===================

  function setStakingFeePercent(uint256 percent) external onlyFounder {
    stakingFeePercent = percent;
    emit StakingFeePercentUpdated(percent);
  }

  function depositToken(uint256 amount) external nonReentrant {
    share.daoFee += amount;
    IERC20(address(this)).safeTransferFrom(msg.sender, address(this), amount);
    emit TokenDeposited(amount);
  }

  function getSpaceInfo() external view returns (SpaceInfo memory) {
    return
      SpaceInfo(
        name(),
        symbol(),
        founder,
        token.x,
        token.y,
        token.k,
        totalFee,
        share.daoFee,
        staking.stakingFee,
        member.planIndex,
        member.subscriptionIndex,
        member.subscriptionIncome,
        staking.yieldStartTime,
        staking.yieldAmount,
        staking.yieldReleased,
        staking.totalStaked,
        staking.accumulatedRewardsPerToken,
        share.accumulatedRewardsPerShare,
        share.orderIndex,
        share.orderIds.values()
      );
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

  function _chargeSubscriptionProtocolFee(uint256 fee) internal returns (uint256 feeToSpace) {
    uint256 feeToProtocol = (fee * subscriptionFeePercent) / 1 ether;
    feeToSpace = fee - feeToProtocol;
    member.subscriptionIncome += feeToSpace;
    IERC20(address(this)).transfer(factory, feeToProtocol);
  }
}
