// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

struct App {
  address creator;
  string uri;
  address feeReceiver;
  uint256 feePercent; // subscription percent
}

interface ISpaceFactory {
  function setPrice(uint256 _price) external;

  function setFeeReceiver(address _receiver) external;

  function createSpace(
    string calldata spaceName,
    string calldata symbol,
    uint256 preBuyEthAmount,
    uint256 appId
  ) external payable;

  function createApp(string calldata _uri, address _feeReceiver, uint256 _feePercent) external;

  function updateApp(uint256 id, string calldata _uri, address _feeReceiver, uint256 _feePercent) external;

  function getApp(uint256 id) external view returns (App memory);

  function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minTokenAmount
  ) external returns (uint256 returnAmount);

  function getUserSpaces(address user) external view returns (address[] memory);

  function isSpace(address spaceAddress) external returns (bool);
}
