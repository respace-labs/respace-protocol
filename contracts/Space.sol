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
import "hardhat/console.sol";

contract Space is ERC20, ERC20Permit, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using Math for uint256;
  using EnumerableSet for EnumerableSet.Bytes32Set;
  using EnumerableSet for EnumerableSet.UintSet;

  address public immutable factory;
  address public immutable founder;

  // fees
  uint256 public daoFeePercent = 0.5 ether; // 50%

  uint256 totalFee;

  string uri;

  // token
  Token.State public token;

  // share
  Share.State share;

  // staking
  Staking.State public staking;

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
    uint256 insuranceEthAmount;
    uint256 insuranceTokenAmount;
    uint256 totalFee;
    uint256 daoFee;
    uint256 stakingFee;
    /** member */
    uint8 planIndex;
    uint256 subscriptionIndex;
    uint256 subscriptionIncome;
    /** staking */
    uint256 totalStaked;
    uint256 accumulatedRewardsPerToken;
    /** share */
    uint256 accumulatedRewardsPerShare;
    uint256 orderIndex;
    uint256[] orderIds;
  }

  event Received(address sender, uint256 daoFee, uint256 stakingFee);

  constructor(
    address _factory,
    address _founder,
    string memory _name,
    string memory _symbol
  ) ERC20(_name, _symbol) ERC20Permit(_name) {
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
    share.contributors[founder].shares = Share.SHARES_SUPPLY;

    Member.createPlan(member, "Member", Member.DEFAULT_SUBSCRIPTION_PRICE);
    token = Token.State(Token.initialX, Token.initialY, Token.initialK, 0, 0);
  }

  function getTokenAmount(uint256 ethAmount) public view returns (Token.BuyInfo memory) {
    return Token.getTokenAmount(token, ethAmount);
  }

  function getEthAmount(uint256 tokenAmount) public view returns (Token.SellInfo memory) {
    return Token.getEthAmount(token, tokenAmount);
  }

  function buy() public payable nonReentrant returns (uint256) {
    Token.BuyInfo memory info = Token.buy(token, msg.value);
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
    return info.tokenAmountAfterFee;
  }

  function sell(uint256 tokenAmount) public payable nonReentrant returns (uint256, uint256) {
    Token.SellInfo memory info = Token.sell(token, tokenAmount);
    IERC20(address(this)).transfer(factory, info.protocolFee);
    TransferUtil.safeTransferETH(msg.sender, info.ethAmount);

    _splitFee(info.creatorFee);
    _burn(address(this), info.tokenAmountAfterFee);

    emit Token.Trade(Token.TradeType.Sell, msg.sender, info.ethAmount, tokenAmount, info.creatorFee, info.protocolFee);
    return (info.tokenAmountAfterFee, info.ethAmount);
  }

  function _splitFee(uint256 fee) internal {
    uint256 feeToDao = (fee * daoFeePercent) / 1 ether;
    share.daoFee += feeToDao;
    staking.stakingFee += fee - feeToDao;
    totalFee += fee;
  }

  // ================member======================

  function createPlan(string calldata _uri, uint256 price) external onlyFounder {
    Member.createPlan(member, _uri, price);
  }

  function setPlanURI(uint8 id, string calldata _uri) external onlyFounder {
    Member.setPlanURI(member, id, _uri);
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
    Token.BuyInfo memory info = getTokenAmount(ethPricePerSecond);
    return info.tokenAmountAfterFee;
  }

  function subscribe(uint8 planId, uint256 amount) external nonReentrant {
    uint256 tokenPricePerSecond = getTokenPricePerSecond(planId);
    uint256 durationFromAmount = amount / tokenPricePerSecond;
    (uint256 subscriptionFee, ) = Member.subscribe(member, planId, amount, durationFromAmount, true);
    if (subscriptionFee > 0) {
      _splitFee(subscriptionFee);
    }
  }

  function subscribeByEth(uint8 planId) external payable nonReentrant {
    uint256 ethAmount = msg.value;
    Token.BuyInfo memory info = Token.buy(token, ethAmount);
    uint256 tokenPricePerSecond = getTokenPricePerSecond(planId);
    uint256 durationByAmount = info.tokenAmountAfterFee / tokenPricePerSecond;
    (uint256 subscriptionFee, ) = Member.subscribe(member, planId, info.tokenAmountAfterFee, durationByAmount, false);
    _mint(address(this), info.tokenAmountAfterFee);

    if (subscriptionFee > 0) {
      _splitFee(subscriptionFee);
    }
  }

  function unsubscribe(uint8 planId, uint256 amount) external nonReentrant {
    uint256 subscriptionFee = Member.unsubscribe(member, planId, amount);

    if (subscriptionFee > 0) {
      _splitFee(subscriptionFee);
    }
  }

  function distributeSubscriptionRewards() external {
    bytes32[] memory ids = member.subscriptionIds.values();
    uint256 len = ids.length;

    for (uint256 i = 0; i < len; i++) {
      (uint256 subscriptionFee, ) = Member.distributeSingleSubscription(member, ids[i]);
      if (subscriptionFee > 0) {
        _splitFee(subscriptionFee);
      }
    }
  }

  function distributeSingleSubscription(uint8 planId, address user) public {
    bytes32 id = keccak256(abi.encode(planId, user));
    (uint256 subscriptionFee, ) = Member.distributeSingleSubscription(member, id);

    if (subscriptionFee > 0) {
      _splitFee(subscriptionFee);
    }
  }

  function getSubscription(uint8 planId, address user) external view returns (Member.Subscription memory) {
    return Member.getSubscription(member, planId, user);
  }

  function getSubscriptions() public view returns (Member.Subscription[] memory) {
    return Member.getSubscriptions(member);
  }

  function calculateConsumedAmount(
    uint8 planId,
    address user,
    uint256 timestamp
  ) public view returns (uint256, uint256) {
    bytes32 id = keccak256(abi.encode(planId, user));
    return Member.calculateConsumedAmount(member, id, timestamp);
  }

  //================share=======================

  function addContributor(address account) external onlyFounder {
    Share.addContributor(share, account);
  }

  function distributeShareRewards() public {
    return Share.distribute(share);
  }

  function claimShareRewards() public nonReentrant {
    Share.claim(share);
  }

  function transferShares(address to, uint256 amount) public nonReentrant {
    Share.transferShares(share, to, amount);
  }

  function createShareOrder(uint256 amount, uint256 price) public nonReentrant returns (uint256) {
    return Share.createShareOrder(share, amount, price);
  }

  function cancelShareOrder(uint256 orderId) public nonReentrant {
    Share.cancelShareOrder(share, orderId);
  }

  function executeShareOrder(uint256 orderId, uint256 amount) public payable nonReentrant {
    Share.executeShareOrder(share, orderId, amount);
  }

  function getShareOrders() external view returns (Share.Order[] memory) {
    return Share.getShareOrders(share);
  }

  function getContributor(address account) public view returns (Share.Contributor memory) {
    return Share.getContributor(share, account);
  }

  function getContributors() public view returns (Share.ContributorInfo[] memory) {
    return Share.getContributors(share);
  }

  function currentContributorRewards(address user) public view returns (uint256) {
    return Share.currentContributorRewards(share, user);
  }

  function addVesting(
    address beneficiaryAddress,
    uint256 startTimestamp,
    uint256 durationSeconds,
    uint256 allocationAmount
  ) external nonReentrant {
    Share.addVesting(share, beneficiaryAddress, startTimestamp, durationSeconds, allocationAmount);
  }

  function releaseVesting() external nonReentrant {
    Share.releaseVesting(share);
  }

  function vestedAmount(address beneficiaryAddress, uint256 timestamp) external view returns (uint256) {
    return Share.vestedAmount(share, beneficiaryAddress, timestamp);
  }

  //================staking=======================

  function currentUserRewards(address user) public view returns (uint256) {
    return Staking.currentUserRewards(staking, user);
  }

  function currentRewardsPerToken() public view returns (uint256) {
    return Staking.currentRewardsPerToken(staking);
  }

  function stake(uint256 amount) public nonReentrant {
    return Staking.stake(staking, amount);
  }

  function unstake(uint256 amount) public nonReentrant {
    return Staking.unstake(staking, amount);
  }

  function claimStakingRewards() public nonReentrant returns (uint256) {
    return Staking.claim(staking);
  }

  function distributeStakingRewards() public {
    return Staking.distribute(staking);
  }

  function getStakingInfo() public view returns (Staking.Info memory) {
    return Staking.Info(staking.stakingFee, staking.totalStaked, staking.accumulatedRewardsPerToken);
  }

  //============others===================

  function getSpaceInfo() external view returns (SpaceInfo memory) {
    return
      SpaceInfo(
        name(),
        symbol(),
        founder,
        token.x,
        token.y,
        token.k,
        token.insuranceEthAmount,
        token.insuranceTokenAmount,
        totalFee,
        share.daoFee,
        staking.stakingFee,
        member.planIndex,
        member.subscriptionIndex,
        member.subscriptionIncome,
        staking.totalStaked,
        staking.accumulatedRewardsPerToken,
        share.accumulatedRewardsPerShare,
        share.orderIndex,
        share.orderIds.values()
      );
  }

  // function getExcessEth() public view returns (uint256) {
  //   uint256 ethAmount = x - initialX;
  //   return address(this).balance - ethAmount;
  // }

  // function getExcessToken() public view returns (uint256) {
  //   return balanceOf(address(this));
  // }

  // function withdrawExcessEth() external onlyFounder {
  //   uint256 excessEth = getExcessEth();
  //   require(excessEth > 0, "No excess ETH to withdraw");
  //   TransferUtil.safeTransferETH(space, excessEth);
  // }

  // function withdrawExcessToken() external onlyFounder {
  //   uint256 excessToken = getExcessToken();
  //   require(excessToken > 0, "No excess Token to withdraw");
  //   IERC20(this).transfer(space, excessToken);
  // }
}
