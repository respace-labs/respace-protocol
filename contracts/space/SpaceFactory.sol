// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IIndieX.sol";
import "./Space.sol";
import "hardhat/console.sol";

contract SpaceFactory is Ownable {
  event Create(uint256 spaceId, address indexed spaceAddress, address creator, string spaceName, string symbol);

  address public immutable indieX;
  uint256 public spaceIndex = 0;
  mapping(uint256 => address) public spaces;

  constructor(address initialOwner, address _indieX) Ownable(initialOwner) {
    indieX = _indieX;
  }

  function create(
    string calldata spaceName,
    string calldata symbol,
    IIndieX.NewCreationInput calldata creationInput,
    IIndieX.NewCreationInput calldata sponsorCreationInput
  ) external {
    Space newSpace = new Space(owner());
    newSpace.create(indieX, spaceName, symbol, creationInput, sponsorCreationInput);
    spaces[spaceIndex] = address(newSpace);

    emit Create(spaceIndex, address(newSpace), msg.sender, spaceName, symbol);

    console.log(">>>>========new=space:", address(newSpace));

    spaceIndex++;
  }
}
