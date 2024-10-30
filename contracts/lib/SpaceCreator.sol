// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "../Space.sol";

library SpaceCreator {
  function createSpace(CreateSpaceInput calldata input) external returns (address) {
    Space space = new Space(input.appId, address(this), msg.sender, input.spaceName, input.symbol, input.uri);
    space.initialize();
    return address(space);
  }
}
