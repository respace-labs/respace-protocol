// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

struct BuyInfo {
  uint256 newX;
  uint256 newY;
  uint256 ethAmount;
  uint256 tokenAmountAfterFee;
  uint256 creatorFee;
  uint256 protocolFee;
}

struct SellInfo {
  uint256 newX;
  uint256 newY;
  uint256 ethAmount;
  uint256 tokenAmountAfterFee;
  uint256 creatorFee;
  uint256 protocolFee;
}

interface ISpace {
  function buy() external payable returns (BuyInfo memory);

  function sell(uint256 tokenAmount) external payable returns (SellInfo memory SellInfo);
}
