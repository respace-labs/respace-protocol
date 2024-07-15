// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

interface ICurve {
  function getPrice(uint256 supply, uint32 amount, uint256[] calldata args) external view returns (uint256);
}
