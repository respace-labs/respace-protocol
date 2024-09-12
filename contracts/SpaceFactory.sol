// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./lib/SpaceHelper.sol";
import "./lib/SpaceCreator.sol";
import "./lib/Events.sol";
import "./interfaces/ISpace.sol";
import "./interfaces/ISpaceFactory.sol";
import "hardhat/console.sol";

contract SpaceFactory is Ownable, ReentrancyGuard {
  uint256 public price = 0.01024 * 1 ether;
  uint256 public appIndex;
  uint256 public spaceIndex;
  address public feeReceiver;
  mapping(uint256 => App) public apps;
  mapping(address => address[]) public userSpaces;
  mapping(uint256 spaceId => address) public spaces;
  mapping(address => address) public spaceToFounder;

  constructor(address initialOwner) Ownable(initialOwner) {}

  receive() external payable {}

  function setPrice(uint256 _price) external onlyOwner {
    price = _price;
    emit Events.PriceUpdated(_price);
  }

  function setFeeReceiver(address _receiver) external onlyOwner {
    feeReceiver = _receiver;
    emit Events.FeeReceiverUpdated(_receiver);
  }

  function createSpace(
    uint256 appId,
    string calldata spaceName,
    string calldata symbol,
    string calldata uri,
    uint256 preBuyEthAmount
  ) external payable nonReentrant {
    address space = SpaceCreator.createSpace(
      price,
      spaceIndex,
      userSpaces,
      spaces,
      spaceToFounder,
      appId,
      spaceName,
      symbol,
      uri,
      preBuyEthAmount
    );

    emit Events.SpaceCreated(spaceIndex, space, msg.sender, spaceName, symbol, uri, preBuyEthAmount);
    spaceIndex++;
  }

  function createApp(string calldata _uri, address _feeReceiver, uint256 _feePercent) external {
    SpaceHelper.createApp(apps, appIndex, _uri, _feeReceiver, _feePercent);
    emit Events.AppCreated(appIndex, msg.sender, _uri, _feeReceiver, _feePercent);
    appIndex++;
  }

  function updateApp(uint256 id, string calldata _uri, address _feeReceiver, uint256 _feePercent) external {
    SpaceHelper.updateApp(apps, id, _uri, _feeReceiver, _feePercent);
    emit Events.AppUpdated(appIndex, msg.sender, _uri, _feeReceiver, _feePercent);
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

  function withdrawEther() external onlyOwner {
    uint256 amount = SpaceHelper.withdrawEther(feeReceiver);
    emit Events.WithdrawEther(feeReceiver, amount);
  }

  function withdrawTokens(address[] calldata tokens) external onlyOwner {
    SpaceHelper.withdrawTokens(feeReceiver, tokens);
  }

  function isSpace(address spaceAddress) external view returns (bool) {
    return SpaceHelper.isSpace(spaceToFounder, spaceAddress);
  }
}
