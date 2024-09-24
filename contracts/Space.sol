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
import "./lib/Curation.sol";
import "./lib/SpaceHelper.sol";
import "./lib/Events.sol";
import "./lib/Errors.sol";
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
  string public uri;

  /** fee config */
  uint256 public stakingRevenuePercent = 0.3 ether; // 30% default
  uint256 public subscriptionFeePercent = 0.02 ether; // 2% to protocol

  /** Module state */
  Token.State public token;
  Share.State public share;
  Staking.State public staking;
  Member.State public member;
  Curation.State public curation;

  /** Sets */
  EnumerableSet.Bytes32Set subscriptionIds;
  EnumerableSet.AddressSet stakers;
  EnumerableSet.UintSet orderIds;
  EnumerableSet.AddressSet vestingAddresses;

  constructor(
    uint256 _appId,
    address _factory,
    address _founder,
    string memory _name,
    string memory _symbol,
    string memory _uri
  ) ERC20(_name, _symbol) ERC20Permit(_name) Ownable(_founder) {
    appId = _appId;
    factory = _factory;
    uri = _uri;
  }

  fallback() external payable {}

  receive() external payable {}

  function initialize() external {
    if (msg.sender != factory) revert Errors.OnlyFactory();

    Share.addContributor(share, owner());
    emit Events.ContributorAdded(owner());

    share.contributors[owner()].shares = SHARES_SUPPLY;

    Curation.initTiers(curation);

    uint8 planId = Member.createPlan(member, "", DEFAULT_SUBSCRIPTION_PRICE, DEFAULT_MIN_SUBSCRIPTION_AMOUNT);

    emit Events.PlanCreated(planId, "", DEFAULT_SUBSCRIPTION_PRICE, 0);

    token = Token.State(Token.initialX, Token.initialY, Token.initialK);

    BuyInfo memory info = Token.buy(token, PREMINT_ETH_AMOUNT, 0);

    uint256 premint = info.tokenAmountAfterFee + info.creatorFee + info.protocolFee;
    staking.yieldAmount = premint;
    staking.yieldStartTime = block.timestamp;
    _mint(address(this), premint);
  }

  function buy(uint256 minReturnAmount) external payable nonReentrant returns (BuyInfo memory info) {
    bool isSwap = msg.sender == factory;
    info = Token.buy(token, msg.value, minReturnAmount);
    if (isSwap) {
      uint256 tokenAmount = info.tokenAmountAfterFee + info.creatorFee + info.protocolFee;
      _mint(msg.sender, tokenAmount);
      emit Events.Trade(
        Events.TradeType.Buy,
        msg.sender,
        info.ethAmount,
        tokenAmount,
        0,
        0,
        IERC20(address(this)).balanceOf(msg.sender)
      );
    } else {
      SpaceHelper.distributeCreatorRevenue(staking, share, stakingRevenuePercent, info.creatorFee);
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
    uint256 minReturnAmount
  ) external payable nonReentrant returns (SellInfo memory info) {
    info = Token.sell(token, tokenAmount, minReturnAmount);

    if (address(this).balance <= info.ethAmount) revert Errors.TokenAmountTooLarge();

    SpaceHelper.distributeCreatorRevenue(staking, share, stakingRevenuePercent, info.creatorFee);
    _burn(address(this), info.tokenAmountAfterFee);

    IERC20(address(this)).transfer(factory, info.protocolFee);

    TransferUtil.safeTransferETH(msg.sender, info.ethAmount);

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

  // ================Member======================

  function createPlan(string calldata _uri, uint256 price, uint256 minEthAmount) external onlyOwner {
    uint8 id = Member.createPlan(member, _uri, price, minEthAmount);
    emit Events.PlanCreated(id, _uri, price, minEthAmount);
  }

  function updatePlan(
    uint8 id,
    string calldata _uri,
    uint256 price,
    uint256 minEthAmount,
    bool isActive
  ) external onlyOwner {
    Member.updatePlan(member, id, _uri, price, minEthAmount, isActive);
    emit Events.PlanUpdated(id, _uri, price, minEthAmount);
  }

  function getPlans() external view returns (Member.Plan[] memory) {
    return Member.getPlans(member);
  }

  function subscribe(uint8 planId, uint256 amount) external nonReentrant {
    if (amount == 0) revert Errors.AmountIsZero();

    IERC20(address(this)).safeTransferFrom(msg.sender, address(this), amount);

    (uint256 increasingDuration, uint256 consumedAmount, uint256 remainingDuration) = Member.subscribe(
      member,
      token,
      curation,
      subscriptionIds,
      planId,
      amount
    );

    _processSubscriptionRevenue(consumedAmount, msg.sender);
    emit Events.Subscribed(planId, false, msg.sender, amount, increasingDuration, remainingDuration);
  }

  function subscribeByEth(uint8 planId) external payable nonReentrant {
    uint256 ethAmount = msg.value;
    if (ethAmount == 0) revert Errors.EthAmountIsZero();

    BuyInfo memory info = Token.buy(token, ethAmount, 0);
    _mint(address(this), info.tokenAmountAfterFee);

    (uint256 increasingDuration, uint256 consumedAmount, uint256 remainingDuration) = Member.subscribe(
      member,
      token,
      curation,
      subscriptionIds,
      planId,
      info.tokenAmountAfterFee
    );

    _processSubscriptionRevenue(consumedAmount, msg.sender);
    emit Events.Subscribed(planId, true, msg.sender, info.tokenAmountAfterFee, increasingDuration, remainingDuration);
  }

  function unsubscribe(uint8 planId, uint256 amount) external nonReentrant {
    (uint256 consumedAmount, uint256 unsubscribeAmount, uint256 unsubscribeDuration, uint256 remainingDuration) = Member
      .unsubscribe(member, curation, subscriptionIds, planId, amount);

    _processSubscriptionRevenue(consumedAmount, msg.sender);
    emit Events.Unsubscribed(planId, msg.sender, unsubscribeAmount, unsubscribeDuration, remainingDuration);
  }

  function distributeSubscriptionRewards(uint256 mintPastDuration) external {
    bytes32[] memory ids = subscriptionIds.values();
    uint256 len = ids.length;

    for (uint256 i = 0; i < len; i++) {
      Member.Subscription memory subscription = member.subscriptions[ids[i]];

      if (block.timestamp - subscription.startTime <= mintPastDuration) {
        continue;
      }

      (uint256 consumedAmount, ) = Member.distributeSingleSubscription(member, curation, subscriptionIds, ids[i]);
      _processSubscriptionRevenue(consumedAmount, subscription.account);
    }
  }

  function distributeSingleSubscription(uint8 planId, address account) external {
    bytes32 id = Member.generateSubscriptionId(planId, account);
    (uint256 consumedAmount, ) = Member.distributeSingleSubscription(member, curation, subscriptionIds, id);
    _processSubscriptionRevenue(consumedAmount, account);
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

  //================Share=======================

  function addContributor(address account) external onlyOwner {
    Share.addContributor(share, account);
    emit Events.ContributorAdded(account);
  }

  function distributeShareRewards() external {
    Share.distribute(share);
    emit Events.ShareRewardsDistributed(msg.sender);
  }

  function claimShareRewards() external nonReentrant returns (uint256 amount) {
    amount = Share.claimRewards(share);
    emit Events.ShareRewardsClaimed(msg.sender, amount);
  }

  function transferShares(address to, uint256 amount) external nonReentrant {
    Share.transferShares(share, to, amount);
    emit Events.SharesTransferred(msg.sender, to, amount);
  }

  function createShareOrder(uint256 amount, uint256 price) external nonReentrant returns (uint256 orderId) {
    orderId = Share.createShareOrder(share, orderIds, amount, price);
    emit Events.ShareOrderCreated(orderId, msg.sender, amount, price);
  }

  function cancelShareOrder(uint256 orderId) external nonReentrant {
    (uint256 amount, uint256 price) = Share.cancelShareOrder(share, orderIds, orderId);
    emit Events.ShareOrderCanceled(orderId, msg.sender, amount, price);
  }

  function executeShareOrder(uint256 orderId, uint256 amount) external payable nonReentrant {
    (address seller, uint256 price) = Share.executeShareOrder(share, orderIds, orderId, amount);
    emit Events.ShareOrderExecuted(orderId, seller, msg.sender, amount, price);
  }

  function getShareOrders() external view returns (Share.OrderInfo[] memory) {
    return Share.getShareOrders(share, orderIds);
  }

  function getContributors() external view returns (Share.Contributor[] memory) {
    return Share.getContributors(share);
  }

  function currentContributorRewards(address account) external view returns (uint256) {
    return Share.currentContributorRewards(share, account);
  }

  function addVesting(address beneficiary, uint256 startTime, uint256 duration, uint256 allocation) external {
    Share.addVesting(share, vestingAddresses, beneficiary, startTime, duration, allocation);
    emit Events.VestingAdded(msg.sender, beneficiary, startTime, duration, allocation);
  }

  function claimVesting() external returns (uint256 amount) {
    amount = Share.claimVesting(share);
    emit Events.VestingClaimed(msg.sender, amount);
  }

  function removeVesting(address beneficiary) external {
    Share.removeVesting(share, vestingAddresses, beneficiary);
    emit Events.VestingRemoved(msg.sender, beneficiary);
  }

  function getVestings() external view returns (Share.VestingInfo[] memory) {
    return Share.getVestings(share, vestingAddresses);
  }

  //================Staking=======================

  function currentUserRewards(address account) external view returns (uint256) {
    return Staking.currentUserRewards(staking, account);
  }

  function getStaker(address account) external view returns (Staking.Staker memory) {
    return Staking.getStaker(staking, account);
  }

  function getStakers() external view returns (Staking.Staker[] memory) {
    return Staking.getStakers(staking, stakers);
  }

  function stake(uint256 amount) external nonReentrant {
    Staking.stake(staking, stakers, amount);
    emit Events.Staked(msg.sender, amount);
  }

  function unstake(uint256 amount) external nonReentrant {
    Staking.unstake(staking, stakers, amount);
    emit Events.Unstaked(msg.sender, amount);
  }

  function claimStakingRewards() external nonReentrant returns (uint256 amount) {
    amount = Staking.claim(staking);
    emit Events.StakingClaimed(msg.sender, amount);
  }

  //================Curation=======================

  // create self invitation code
  function createCode(bytes32 _code) external {
    Curation.createCode(curation, _code);
    emit Events.CodeCreated(msg.sender, _code);
  }

  // update self invitation code
  function updateCode(bytes32 _code) external {
    Curation.updateCode(curation, _code);
    emit Events.CodeUpdated(msg.sender, _code);
  }

  function bindCode(bytes32 _code) external {
    Curation.bindCode(curation, _code);
    emit Events.CodeBound(msg.sender, _code);
  }

  function getCurationUser(address account) external view returns (Curation.User memory) {
    return Curation.getUser(curation, account);
  }

  function getCurationUserByCode(bytes32 code) external view returns (Curation.User memory) {
    return Curation.getUserByCode(curation, code);
  }

  function getCodeByCurator(address account) external view returns (bytes32) {
    return Curation.getCodeByCurator(curation, account);
  }

  function getCuratorByCode(bytes32 code) external view returns (address) {
    return Curation.getCuratorByCode(curation, code);
  }

  function updateTier(uint256 id, uint256 memberCountBreakpoint, uint256 rebateRate) external onlyOwner {
    Curation.updateTier(curation, id, memberCountBreakpoint, rebateRate);
    emit Events.TierUpdated(id, memberCountBreakpoint, rebateRate);
  }

  function getTier(uint256 id) external view returns (Curation.Tier memory) {
    return Curation.getTier(curation, id);
  }

  function claimCurationRewards() external nonReentrant returns (uint256 rewards) {
    rewards = Curation.claimRewards(curation);
    emit Events.CurationRewardsClaimed(msg.sender, rewards);
  }

  //============Others===================

  function updateURI(string calldata _uri) external onlyOwner {
    uri = _uri;
    emit Events.SpaceURIUpdated(_uri);
  }

  function setStakingRevenuePercent(uint256 percent) external onlyOwner {
    if (percent < 0.1 ether || percent > 1 ether) revert Errors.InvalidStakingRevenuePercent();
    stakingRevenuePercent = percent;
    emit Events.StakingRevenuePercentUpdated(percent);
  }

  /**
   * deposit space to for share holder
   * @param amount token amount
   */
  function depositSpaceToken(uint256 amount) external nonReentrant {
    share.daoRevenue += amount;
    IERC20(address(this)).safeTransferFrom(msg.sender, address(this), amount);
    emit Events.TokenDeposited(amount);
  }

  function _processSubscriptionRevenue(uint256 revenue, address account) private {
    if (revenue > 0) {
      uint256 creatorRenvenue = SpaceHelper.deductSubscriptionFees(
        member,
        factory,
        appId,
        subscriptionFeePercent,
        revenue
      );

      Curation.User memory user = curation.users[account];

      if (user.curator == address(0)) {
        SpaceHelper.distributeCreatorRevenue(staking, share, stakingRevenuePercent, creatorRenvenue);
      } else {
        Curation.User storage curatorUser = curation.users[user.curator];
        uint256 rebateRate = Curation.getRebateRate(curation, curatorUser.memberCount);

        uint256 rewards = (creatorRenvenue * rebateRate) / 1 ether;
        curatorUser.rewards += rewards;

        SpaceHelper.distributeCreatorRevenue(staking, share, stakingRevenuePercent, creatorRenvenue - rewards);
      }
    }
  }
}
