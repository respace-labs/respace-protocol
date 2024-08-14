// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../lib/TransferUtil.sol";
import "../lib/Share.sol";
import "../lib/Staking.sol";
import "../interfaces/IIndieX.sol";

contract Space is ERC20, ERC20Permit, ERC1155Holder, ReentrancyGuard {
  event Trade(
    TradeType indexed tradeType,
    address indexed account,
    uint256 ethAmount,
    uint256 tokenAmount,
    uint256 fee
  );

  enum TradeType {
    Buy,
    Sell
  }

  uint256 public constant k = 32190005730 * 1 ether * 1 ether;

  // initial virtual eth amount
  uint256 public constant initialX = 30 * 1 ether;
  // initial virtual token amount
  uint256 public constant initialY = 1073000191 * 1 ether;

  uint256 public x = initialX;
  uint256 public y = initialY;

  uint256 public constant FEE_RATE = 1; // 1%

  address public immutable founder;

  // indieX;
  address public immutable indieX;

  // space info
  uint256 creationId;

  struct SpaceInfo {
    string name;
    address founder;
    uint256 creationId;
    uint256 daoFees;
    uint256 stakingFees;
  }

  // fees
  uint256 public daoFeePercent = 0.5 ether; // 50%

  event Received(address sender, uint256 daoFee, uint256 stakingFee);

  // share
  Share.State share;

  // staking
  Staking.State staking;

  constructor(
    address _indieX,
    address _founder,
    string memory _name,
    string memory _symbol
  ) ERC20(_name, _symbol) ERC20Permit(_name) {
    indieX = _indieX;
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

  function initialize(IIndieX.NewCreationInput calldata creationInput) external {
    creationId = IIndieX(indieX).newCreation(creationInput);

    IERC1155(indieX).safeTransferFrom(address(this), founder, creationId, 1, "");

    Share.addContributor(share, Share.UpsertContributorInput(founder, 10_000));
  }

  function buy() public payable nonReentrant {
    uint256 ethAmount = msg.value;
    require(ethAmount > 0, "ETH amount must be greater than zero");

    uint256 fee = (ethAmount * FEE_RATE) / 100;
    uint256 ethAmountAfterFee = ethAmount - fee;

    uint256 newX = x + ethAmountAfterFee;
    uint256 newY = k / newX;
    uint256 tokenAmount = y - newY;

    x = newX;
    y = newY;

    _mint(msg.sender, tokenAmount);

    emit Trade(TradeType.Buy, msg.sender, ethAmount, tokenAmount, fee);
  }

  function sell(uint256 tokenAmount) public payable nonReentrant {
    require(tokenAmount > 0, "Token amount must be greater than zero");

    uint256 fee = (tokenAmount * FEE_RATE) / 100;
    uint256 tokenAmountAfterFee = tokenAmount - fee;

    uint256 newY = y + tokenAmountAfterFee;
    uint256 newX = k / newY;
    uint256 ethAmount = x - newX;

    y = newY;
    x = newX;

    IERC20(this).transferFrom(msg.sender, address(this), tokenAmount);
    _burn(address(this), tokenAmountAfterFee);

    TransferUtil.safeTransferETH(msg.sender, ethAmount);

    emit Trade(TradeType.Sell, msg.sender, ethAmount, tokenAmount, fee);
  }

  function getExcessEth() public view returns (uint256) {
    uint256 ethAmount = x - initialX;
    return address(this).balance - ethAmount;
  }

  function getExcessToken() public view returns (uint256) {
    return balanceOf(address(this));
  }

  function getInfo() external view returns (SpaceInfo memory) {
    return SpaceInfo(name(), founder, creationId, share.daoFees, staking.stakingFees);
  }

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

  function newCreation(IIndieX.NewCreationInput memory input) external {
    IIndieX(indieX).newCreation(input);
  }

  //================share=======================

  function addContributor(Share.UpsertContributorInput calldata _contributor) external {
    Share.addContributor(share, _contributor);
  }

  function upsertContributors(Share.UpsertContributorInput[] calldata _contributors) external {
    Share.upsertContributors(share, _contributors);
  }

  function distributeShareRewards() public {
    return Share.distribute(share);
  }

  function claimShareRewards() public nonReentrant {
    Share.claim(share);
  }

  function getContributors() public view returns (Share.ContributorInfo[] memory) {
    return Share.getContributors(share);
  }

  function currentContributorRewards(address user) public view returns (uint256) {
    return Share.currentContributorRewards(share, user);
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
}
