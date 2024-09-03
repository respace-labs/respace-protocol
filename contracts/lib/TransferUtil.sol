// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library TransferUtil {
  function safeTransferETH(address to, uint256 value) internal {
    require(to != address(0), "Invalid address");
    (bool success, ) = to.call{ value: value }("");
    require(success, "ETH transfer failed");
  }
}
