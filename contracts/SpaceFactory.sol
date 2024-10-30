// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./lib/TransferUtil.sol";
import "./lib/SpaceHelper.sol";
import "./lib/SpaceCreator.sol";
import "./lib/Events.sol";
import "./interfaces/ISpace.sol";
import "./interfaces/ISpaceFactory.sol";

contract SpaceFactory is ISpaceFactory, ReentrancyGuard, AccessControl {
  using SafeERC20 for IERC20;

  uint256 public price = 0.01024 * 1 ether;
  uint256 public referralRewardRate = 0.5 * 1 ether;
  uint256 public appIndex;
  uint256 public spaceIndex;
  address public feeReceiver;

  bytes32 public constant APP_ROLE = keccak256("APP_ROLE");
  bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");

  mapping(uint256 => App) public apps;
  mapping(address => address[]) public userSpaces;
  mapping(uint256 spaceId => address) public spaces;
  mapping(address => address) public spaceToFounder;

  constructor(address defaultAdmin) {
    _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
    _grantRole(APP_ROLE, defaultAdmin);
    _grantRole(CONFIG_ROLE, defaultAdmin);
  }

  receive() external payable {}

  function setPrice(uint256 _price) external onlyRole(CONFIG_ROLE) {
    price = _price;
    emit Events.PriceUpdated(_price);
  }

  function setReferralRewardRate(uint256 _rate) external onlyRole(CONFIG_ROLE) {
    referralRewardRate = _rate;
    emit Events.ReferralRewardRateUpdated(_rate);
  }

  function setFeeReceiver(address _receiver) external onlyRole(CONFIG_ROLE) {
    feeReceiver = _receiver;
    emit Events.FeeReceiverUpdated(_receiver);
  }

  function createSpace(CreateSpaceInput calldata input) external payable nonReentrant {
    if (input.appId > appIndex) revert Errors.InvalidAppId();
    if (msg.value < price + input.preBuyEthAmount) {
      revert Errors.InsufficientPayment();
    }

    address space = SpaceCreator.createSpace(input);

    uint256 currentSpaceIndex = spaceIndex;
    spaces[currentSpaceIndex] = address(space);
    userSpaces[msg.sender].push(address(space));
    spaceToFounder[address(space)] = msg.sender;

    if (input.preBuyEthAmount > 0) {
      BuyInfo memory info = ISpace(space).buy{ value: input.preBuyEthAmount }(0);
      IERC20(space).transfer(msg.sender, info.tokenAmountAfterFee);
    }

    if (input.referral != address(0)) {
      TransferUtil.safeTransferETH(input.referral, (price * referralRewardRate) / 1 ether);
    }

    emit Events.SpaceCreated(
      spaceIndex,
      space,
      msg.sender,
      input.spaceName,
      input.symbol,
      input.uri,
      input.preBuyEthAmount,
      input.referral
    );
    ++spaceIndex;
  }

  function createApp(string calldata _uri, address _feeReceiver, uint256 _feePercent) external onlyRole(APP_ROLE) {
    if (_feeReceiver == address(0)) revert Errors.InvalidFeeReceiver();
    if (_feePercent > 0.15 ether) revert Errors.ExceedMaxAppFeePercent();
    apps[appIndex] = App(msg.sender, _uri, _feeReceiver, _feePercent);

    emit Events.AppCreated(appIndex, msg.sender, _uri, _feeReceiver, _feePercent);
    ++appIndex;
  }

  function updateApp(
    uint256 id,
    string calldata _uri,
    address _feeReceiver,
    uint256 _feePercent
  ) external onlyRole(APP_ROLE) {
    App storage app = apps[id];
    if (app.creator == address(0)) revert Errors.AppNotFound();
    if (app.creator != msg.sender) revert Errors.OnlyCreator();
    if (_feeReceiver == address(0)) revert Errors.InvalidFeeReceiver();
    if (_feePercent > 0.15 ether) revert Errors.ExceedMaxAppFeePercent();
    app.uri = _uri;
    app.feeReceiver = _feeReceiver;
    app.feePercent = _feePercent;

    emit Events.AppUpdated(id, msg.sender, _uri, _feeReceiver, _feePercent);
  }

  function getApp(uint256 id) external view returns (App memory) {
    return apps[id];
  }

  function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minTokenAmount
  ) external nonReentrant returns (uint256 returnAmount) {
    returnAmount = SpaceHelper.swap(spaceToFounder, tokenIn, tokenOut, amountIn, minTokenAmount);
    emit Events.Swap(msg.sender, tokenIn, tokenOut, amountIn, returnAmount);
  }

  function getUserSpaces(address account) external view returns (address[] memory) {
    return userSpaces[account];
  }

  function withdrawEther() external onlyRole(getRoleAdmin(DEFAULT_ADMIN_ROLE)) {
    uint256 amount = SpaceHelper.withdrawEther(feeReceiver);
    emit Events.WithdrawEther(feeReceiver, amount);
  }

  function withdrawTokens(address[] calldata tokens) external onlyRole(getRoleAdmin(DEFAULT_ADMIN_ROLE)) {
    SpaceHelper.withdrawTokens(feeReceiver, tokens);
  }

  function isSpace(address spaceAddress) external view returns (bool) {
    return SpaceHelper.isSpace(spaceToFounder, spaceAddress);
  }
}
