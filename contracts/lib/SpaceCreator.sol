// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";
import "../interfaces/ISpaceFactory.sol";
import "../interfaces/ISpace.sol";
import "../Space.sol";
import "./Events.sol";
import "./TransferUtil.sol";

library SpaceCreator {
  using SafeERC20 for IERC20;

  function createSpace(
    uint256 price,
    uint256 spaceIndex,
    mapping(address => address[]) storage userSpaces,
    mapping(uint256 spaceId => address) storage spaces,
    mapping(address => address) storage spaceToFounder,
    uint256 appId,
    string calldata spaceName,
    string calldata symbol,
    uint256 preBuyEthAmount
  ) external {
    require(msg.value >= price + preBuyEthAmount, "Insufficient payment");

    address founder = msg.sender;
    Space space = new Space(appId, address(this), founder, spaceName, symbol);

    space.initialize();

    uint256 currentSpaceIndex = spaceIndex;
    spaces[currentSpaceIndex] = address(space);
    userSpaces[msg.sender].push(address(space));
    spaceToFounder[address(space)] = founder;
    emit Events.SpaceCreated(currentSpaceIndex, founder, spaceName, symbol, preBuyEthAmount);

    if (preBuyEthAmount > 0) {
      BuyInfo memory info = space.buy{ value: preBuyEthAmount }(0);
      IERC20(space).transfer(msg.sender, info.tokenAmountAfterFee);
    }
  }
}
