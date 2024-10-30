// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

struct App {
  address creator;
  string uri;
  address feeReceiver;
  uint256 feePercent; // subscription percent
}

struct CreateSpaceInput {
  uint256 appId;
  string spaceName;
  string symbol;
  string uri;
  uint256 preBuyEthAmount;
  address referral;
}

interface ISpaceFactory {
  function setPrice(uint256 _price) external;

  function setFeeReceiver(address _receiver) external;

  function createSpace(CreateSpaceInput calldata input) external payable;

  function createApp(string calldata _uri, address _feeReceiver, uint256 _feePercent) external;

  function updateApp(uint256 id, string calldata _uri, address _feeReceiver, uint256 _feePercent) external;

  function getApp(uint256 id) external view returns (App memory);

  function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minTokenAmount
  ) external returns (uint256 returnAmount);

  function getUserSpaces(address account) external view returns (address[] memory);

  function isSpace(address spaceAddress) external view returns (bool);
}
