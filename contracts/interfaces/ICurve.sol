// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

interface ICurve {
  struct Params {
    uint8 a;
    uint8 b;
    uint8 c;
    uint8 d;
    uint8 f;
    uint8 g;
  }

  function getPrice(uint256 supply, uint256 amount) external pure returns (uint256);
}
