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

contract Space is ISpace, ERC20, ERC20Permit, Ownable, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.Bytes32Set;
  using EnumerableSet for EnumerableSet.UintSet;

  address public immutable factory;
  uint256 public immutable appId;

  Config public config;

  /** Module state */
  Token.State public token;
  Share.State public share;
  Staking.State public staking;
  Member.State public member;
  Curation.State public curation;

  /** Sets */
  EnumerableSet.Bytes32Set private subscriptionIds;
  EnumerableSet.UintSet private orderIds;
  EnumerableSet.AddressSet private vestingAddresses;

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
    config = Config(_uri, 0.3 ether, 0.02 ether);
  }

  fallback() external payable {}

  receive() external payable {}

  function initialize() external {
    (uint8 planId, uint256 premint) = SpaceHelper.initialize(member, share, curation, staking, token, factory, owner());

    _mint(address(this), premint);
    emit Events.ContributorAdded(owner());
    emit Events.PlanCreated(planId, "", DEFAULT_SUBSCRIPTION_PRICE, 0);
  }

  function buy(uint256 minReturnAmount) external payable nonReentrant returns (BuyInfo memory info) {
    bool isSwap = msg.sender == factory;
    info = Token.buy(token, msg.value, minReturnAmount);
    uint256 tokenAmount = info.tokenAmountAfterFee;
    if (isSwap) {
      tokenAmount = info.tokenAmountAfterFee + info.creatorFee + info.protocolFee;
      _mint(msg.sender, tokenAmount);
    } else {
      _distributeCreatorRevenue(info.creatorFee);
      _mint(msg.sender, tokenAmount);
      _mint(address(this), info.creatorFee);
      _mint(factory, info.protocolFee);
    }

    emit Events.Trade(
      Events.TradeType.Buy,
      msg.sender,
      info.ethAmount,
      tokenAmount,
      isSwap ? 0 : info.creatorFee,
      isSwap ? 0 : info.protocolFee,
      IERC20(address(this)).balanceOf(msg.sender)
    );
  }

  function sell(
    uint256 tokenAmount,
    uint256 minReturnAmount
  ) external payable nonReentrant returns (SellInfo memory info) {
    info = Token.sell(token, tokenAmount, minReturnAmount);
    if (address(this).balance <= info.ethAmount) revert Errors.TokenAmountTooLarge();

    _distributeCreatorRevenue(info.creatorFee);
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

  function getPlans() external view returns (Plan[] memory) {
    return Member.getPlans(member);
  }

  function subscribe(uint8 planId, uint256 amount) external nonReentrant {
    if (amount == 0) revert Errors.AmountIsZero();
    IERC20(address(this)).safeTransferFrom(msg.sender, address(this), amount);
    _subscribe(planId, amount, false);
  }

  function subscribeByEth(uint8 planId) external payable nonReentrant {
    uint256 ethAmount = msg.value;
    if (ethAmount == 1) revert Errors.EthAmountIsZero();

    BuyInfo memory info = Token.buy(token, ethAmount, 0);
    _mint(address(this), info.tokenAmountAfterFee);
    _subscribe(planId, info.tokenAmountAfterFee, true);
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
      Subscription memory subscription = member.subscriptions[ids[i]];

      if (block.timestamp - subscription.startTime <= mintPastDuration) {
        continue;
      }

      (uint256 consumedAmount, ) = Member.distributeSingleSubscription(member, curation, subscriptionIds, ids[i]);
      _processSubscriptionRevenue(consumedAmount, subscription.account);
    }

    emit Events.DistributeSubscriptionRewards(msg.sender, mintPastDuration);
  }

  function distributeSingleSubscription(uint8 planId, address account) external {
    bytes32 id = Member.generateSubscriptionId(planId, account);
    (uint256 consumedAmount, ) = Member.distributeSingleSubscription(member, curation, subscriptionIds, id);
    _processSubscriptionRevenue(consumedAmount, account);
    emit Events.DistributeSingleSubscription(planId, account);
  }

  function getSubscription(uint8 planId) external view returns (Subscription memory) {
    return Member.getSubscription(member, planId);
  }

  function getSubscriptions() external view returns (Subscription[] memory) {
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

  function getShareOrders() external view returns (OrderInfo[] memory) {
    return Share.getShareOrders(share, orderIds);
  }

  function getContributors() external view returns (Contributor[] memory) {
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

  function getVestings() external view returns (VestingInfo[] memory) {
    return Share.getVestings(share, vestingAddresses);
  }

  //================Staking=======================

  function currentUserRewards(address account) external view returns (uint256) {
    return Staking.currentUserRewards(staking, account);
  }

  function getStaker(address account) external view returns (Staker memory) {
    return Staking.getStaker(staking, account);
  }

  function stake(uint256 amount) external nonReentrant {
    Staking.stake(staking, amount);
    emit Events.Staked(msg.sender, amount);
  }

  function unstake(uint256 amount) external nonReentrant {
    Staking.unstake(staking, amount);
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

  function getCurationUser(address account) external view returns (CurationUser memory) {
    return Curation.getUser(curation, account);
  }

  function getCurationUserByCode(bytes32 code) external view returns (CurationUser memory) {
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

  function getTier(uint256 id) external view returns (Tier memory) {
    return Curation.getTier(curation, id);
  }

  function claimCurationRewards() external nonReentrant returns (uint256 rewards) {
    rewards = Curation.claimRewards(curation);
    emit Events.CurationRewardsClaimed(msg.sender, rewards);
  }

  //============Others===================

  function updateConfig(string calldata uri, uint256 stakingRevenuePercent) external onlyOwner {
    config.uri = uri;
    config.stakingRevenuePercent = stakingRevenuePercent;
    emit Events.SpaceConfigUpdated(uri, stakingRevenuePercent);
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

  function _subscribe(uint8 planId, uint256 amount, bool isUsingEth) internal {
    (uint256 increasingDuration, uint256 consumedAmount, uint256 remainingDuration) = Member.subscribe(
      member,
      token,
      curation,
      subscriptionIds,
      planId,
      amount
    );

    _processSubscriptionRevenue(consumedAmount, msg.sender);
    emit Events.Subscribed(planId, isUsingEth, msg.sender, amount, increasingDuration, remainingDuration);
  }

  function _distributeCreatorRevenue(uint256 creatorFee) internal {
    SpaceHelper.distributeCreatorRevenue(staking, share, config.stakingRevenuePercent, creatorFee);
  }

  function _processSubscriptionRevenue(uint256 revenue, address account) internal {
    SpaceHelper.processSubscriptionRevenue(member, share, curation, staking, config, factory, appId, revenue, account);
  }
}
