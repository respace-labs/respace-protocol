// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/ICurve.sol";

contract QuadraticCurve is ICurve {
  function getPrice(uint256 supply, uint256 amount, uint32[] calldata args) external pure override returns (uint256) {
    return (_curve(supply + amount) - _curve(supply)) / 1 ether / 1 ether / 50_000;
  }

  function _curve(uint256 x) private pure returns (uint256) {
    return x * x * x;
  }
}
