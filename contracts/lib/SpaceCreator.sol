// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";
import "../interfaces/ISpaceFactory.sol";
import "../interfaces/ISpace.sol";
import "../Space.sol";
import "./TransferUtil.sol";

library SpaceCreator {
  using SafeERC20 for IERC20;

  function createSpace(
    uint256 price,
    uint256 spaceIndex,
    mapping(address => address[]) storage userSpaces,
    mapping(uint256 spaceId => address) storage spaces,
    mapping(address => address) storage spaceToFounder,
    CreateSpaceInput calldata input
  ) external returns (address) {
    require(msg.value >= price + input.preBuyEthAmount, "Insufficient payment");

    address founder = msg.sender;
    Space space = new Space(input.appId, address(this), founder, input.spaceName, input.symbol, input.uri);

    space.initialize();

    uint256 currentSpaceIndex = spaceIndex;
    spaces[currentSpaceIndex] = address(space);
    userSpaces[msg.sender].push(address(space));
    spaceToFounder[address(space)] = founder;

    if (input.preBuyEthAmount > 0) {
      BuyInfo memory info = space.buy{ value: input.preBuyEthAmount }(0);
      IERC20(space).transfer(msg.sender, info.tokenAmountAfterFee);
    }
    return address(space);
  }
}
