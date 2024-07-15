// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

interface ICurve {
  function getPrice(uint256 supply, uint256 amount, uint32[] calldata args) external pure returns (uint256);
}
