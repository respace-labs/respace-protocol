// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./lib/TransferUtil.sol";
import "./lib/Share.sol";
import "./lib/Staking.sol";
import "./lib/Member.sol";
import "./lib/Token.sol";

contract Space is ERC20, ERC20Permit, ERC1155Holder, ReentrancyGuard {
  using SafeERC20 for IERC20;

  address public immutable founder;

  // fees
  uint256 public daoFeePercent = 0.5 ether; // 50%

  // token
  Token.State public token;

  // share
  Share.State public share;

  // staking
  Staking.State public staking;

  // subscription
  Member.State member;

  struct SpaceInfo {
    string name;
    string symbol;
    address founder;
    // token
    uint256 x;
    uint256 y;
    uint256 k;
    // fee
    uint256 daoFees;
    uint256 stakingFees;
    // member
    uint256 subscriptionPrice;
    uint256 subscriptionIncome;
    // staking
    uint256 totalStaked;
    uint256 accumulatedRewardsPerToken;
    // share
    uint256 totalShare;
    uint256 accumulatedRewardsPerShare;
  }

  event Received(address sender, uint256 daoFee, uint256 stakingFee);

  constructor(address _founder, string memory _name, string memory _symbol) ERC20(_name, _symbol) ERC20Permit(_name) {
    founder = _founder;
  }

  modifier onlyFounder() {
    require(msg.sender == founder, "Only Founder");
    _;
  }

  fallback() external payable {}

  receive() external payable {
    uint256 fees = msg.value;
    uint256 feeToDao = (fees * daoFeePercent) / 1 ether;
    uint256 feeToStaking = fees - feeToDao;

    share.daoFees += feeToDao;
    staking.stakingFees += feeToStaking;
    emit Received(msg.sender, feeToDao, feeToStaking);
  }

  function initialize() external {
    Share.addContributor(share, founder);
    share.contributors[founder].shares = Share.MAX_SHARES_SUPPLY;

    member.subscriptionPrice = Member.SUBSCRIPTION_PRICE;

    token = Token.State(Token.initialX, Token.initialY, Token.initialK);
  }

  function getTokenAmount(
    uint256 ethAmount
  ) public view returns (uint256 tokenAmount, uint256 newX, uint256 newY, uint256 fee) {
    return Token.getTokenAmount(token, ethAmount);
  }

  function getEthAmount(
    uint256 tokenAmount
  ) public view returns (uint256 ethAmount, uint256 tokenAmountAfterFee, uint256 newX, uint256 newY, uint256 fee) {
    return Token.getEthAmount(token, tokenAmount);
  }

  function buy() public payable nonReentrant returns (uint256) {
    uint256 tokenAmount = Token.buy(token, msg.value);
    _mint(msg.sender, tokenAmount);
    return tokenAmount;
  }

  function sell(uint256 tokenAmount) public payable nonReentrant returns (uint256) {
    uint256 tokenAmountAfterFee = Token.sell(token, tokenAmount);
    _burn(address(this), tokenAmountAfterFee);
    return tokenAmountAfterFee;
  }

  // ================member======================

  function setSubscriptionPrice(uint256 price) external onlyFounder {
    return Member.setSubscriptionPrice(member, price);
  }

  function getTokenPricePerSecond() public view returns (uint256) {
    uint256 ethPricePerSecond = member.subscriptionPrice / Member.SECONDS_PER_MONTH;
    (uint tokenAmount, , , ) = getTokenAmount(ethPricePerSecond);
    return tokenAmount;
  }

  function subscribeByToken(uint256 amount) external nonReentrant {
    uint256 tokenPricePerSecond = getTokenPricePerSecond();
    uint256 durationByAmount = amount / tokenPricePerSecond;

    Member.subscribeByToken(member, amount, durationByAmount, true);
  }

  function subscribeByEth() external payable nonReentrant {
    uint256 ethAmount = msg.value;
    uint256 tokenAmount = Token.buy(token, ethAmount);
    uint256 tokenPricePerSecond = getTokenPricePerSecond();
    uint256 durationByAmount = tokenAmount / tokenPricePerSecond;
    Member.subscribeByToken(member, tokenAmount, durationByAmount, false);
    _mint(address(this), tokenAmount);
  }

  function unsubscribeByToken(uint256 amount) external nonReentrant {
    Member.unsubscribeByToken(member, amount);
  }

  function distributeSubscriptionRewards() external {
    Member.distributeSubscriptionRewards(member);
  }

  function distributeSingleSubscription(address user) public {
    Member.distributeSingleSubscription(member, user);
  }

  function getMemberInfo() external view returns (Member.Info memory) {
    return Member.getInfo(member);
  }

  function getSubscription(address user) external view returns (Member.Subscription memory) {
    return Member.getSubscription(member, user);
  }

  function getSubscriptions() public view returns (Member.Subscription[] memory) {
    return Member.getSubscriptions(member);
  }

  function payedAmount(address user, uint256 timestamp) public view returns (uint256) {
    return Member.consumedAmount(member, user, timestamp);
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
    return Staking.Info(staking.stakingFees, staking.totalStaked, staking.accumulatedRewardsPerToken);
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
        share.daoFees,
        staking.stakingFees,
        member.subscriptionPrice,
        member.subscriptionIncome,
        staking.totalStaked,
        staking.accumulatedRewardsPerToken,
        share.totalShare,
        share.accumulatedRewardsPerShare
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
