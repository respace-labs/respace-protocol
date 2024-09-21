// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library TransferUtil {
  function safeTransferETH(address to, uint256 value) internal {
    (bool success, ) = to.call{ value: value }("");
    require(success, "TF");
  }
}
