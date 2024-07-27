// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/ICurve.sol";

contract QuadraticCurve is ICurve {
  function getPrice(uint256 supply, uint256 amount, uint256[] memory args) public pure returns (uint256) {
    uint256 len = args.length;
    uint256 basePrice = len > 0 ? args[0] : 0.01024 ether;
    uint256 factor = len > 1 ? args[1] : 50_000;
    uint256 sumOfAmount = (_curve(supply + amount) - _curve(supply)) / 1 ether / 1 ether / factor;
    uint256 sumOfBasePrice = (basePrice * amount) / 1 ether;
    return sumOfAmount + sumOfBasePrice;
  }

  function _curve(uint256 x) private pure returns (uint256) {
    return x * x * x;
  }
}
