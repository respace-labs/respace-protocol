// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { UD60x18, ud, add, mul, ln, unwrap } from "@prb/math/src/UD60x18.sol";
import "../interfaces/ICurve.sol";

contract LogarithmicCurve {
  function getPrice(uint256 supply, uint32 amount, uint256[] calldata args) external pure returns (uint256) {
    uint256 totalPrice = 0;
    for (uint256 i = 1; i <= amount; i++) {
      totalPrice += curve(supply + i, args);
    }
    return totalPrice;
  }

  /**
   * P(y)= 0.2 * ln(0.01 * x + 1) + 0.1
   * P(y)= a * ln(b * x + c) + d
   *
   * @param x totalSupply
   */
  function curve(uint256 x, uint256[] memory args) public pure returns (uint256) {
    uint256 len = args.length;
    uint256 a = len > 0 ? args[0] : 2 * 10 ** 17;
    uint256 b = len > 1 ? args[1] : 1 * 10 ** 16;
    uint256 c = len > 2 ? args[2] : 1 * 10 ** 18;
    uint256 d = len > 3 ? args[3] : 1 * 10 ** 18;

    // Calculate the argument for the natural logarithm
    UD60x18 argument = ud(b * x + c);

    // Calculate the natural logarithm
    UD60x18 lnValue = ln(argument);

    // Calculate the final price
    UD60x18 result = ud(a) * lnValue + ud(d);

    return result.unwrap();
  }
}
