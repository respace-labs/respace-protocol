// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/ISpaceFactory.sol";
import "../interfaces/ISpace.sol";
import "../Space.sol";
import "./TransferUtil.sol";

library SpaceCreator {
  function createSpace(CreateSpaceInput calldata input) external returns (address) {
    Space space = new Space(input.appId, address(this), msg.sender, input.spaceName, input.symbol, input.uri);

    space.initialize();
    return address(space);
  }
}
