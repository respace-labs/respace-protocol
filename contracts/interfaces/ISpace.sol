// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISpace {
  function buy() external payable returns (uint256);

  function sell(uint256 tokenAmount) external payable returns (uint256, uint256);
}
