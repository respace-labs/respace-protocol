// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interface/ICurve.sol";

contract QuadraticCurve is ICurve {
  function getPrice(uint256 supply, uint256 amount) external override returns (uint256) {
    //
    return 0;
  }
}
