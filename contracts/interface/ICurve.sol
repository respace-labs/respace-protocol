// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

interface ICurve {
  function getPrice(uint256 supply, uint256 amount) external returns (uint256);
}
