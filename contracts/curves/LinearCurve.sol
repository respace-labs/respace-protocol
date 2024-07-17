// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";
import "../interfaces/ICurve.sol";

contract LinearCurve is ICurve {
  function getPrice(uint256 supply, uint32 amount, uint256[] calldata args) external pure override returns (uint256) {
    uint256 summation = sum(supply + amount, args) - sum(supply, args);
    return summation;
  }

  /**
   * sum of f(x)= a*x + b
   * @param x supply
   */
  function sum(uint256 x, uint256[] memory args) public pure returns (uint256) {
    uint256 len = args.length;
    uint256 a = len > 0 ? args[0] : 1;
    uint256 b = len > 1 ? args[1] : 0;

    uint sumAX = (a * x * (x + 1)) / 2;
    uint sumB = b * x;

    return sumAX + sumB;
  }

  function curve(uint256 x, uint256[] memory args) public pure returns (uint256) {
    uint256 len = args.length;
    uint256 a = len > 0 ? args[0] : 1;
    uint256 b = len > 1 ? args[1] : 0;
    return a * x + b;
  }
}
