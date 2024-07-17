// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/ICurve.sol";

contract QuadraticCurve is ICurve {
  function getPrice(uint256 supply, uint32 amount, uint256[] calldata args) external pure returns (uint256) {
    uint256 totalPrice = 0;

    for (uint256 i = 1; i <= amount; i++) {
      totalPrice += curve(supply + i, args);
    }
    return totalPrice;
  }

  function curve(uint256 x, uint256[] memory args) public pure returns (uint256) {
    uint256 len = args.length;
    uint256 a = len > 0 ? args[0] : 10 ** 18 / 16000;
    uint256 b = len > 1 ? args[1] : 0;
    return a * x * x + b;
  }
}
