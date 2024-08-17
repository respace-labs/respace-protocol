// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IIndieX.sol";
import "./Space.sol";

contract SpaceFactory is ERC1155Holder, Ownable, ReentrancyGuard {
  event Create(uint256 indexed spaceId, address creator, string spaceName, string symbol);

  address public immutable indieX;
  uint256 public spaceIndex = 0;
  mapping(address => address[]) public userSpaces;

  mapping(uint256 spaceId => address) public spaces;

  constructor(address initialOwner, address _indieX) Ownable(initialOwner) {
    indieX = _indieX;
  }

  function createSpace(
    string calldata spaceName,
    string calldata symbol,
    IIndieX.NewCreationInput calldata creationInput
  ) external {
    address founder = msg.sender;
    Space space = new Space(indieX, founder, spaceName, symbol);

    space.initialize(creationInput);

    spaces[spaceIndex] = address(space);
    userSpaces[msg.sender].push(address(space));
    emit Create(spaceIndex, founder, spaceName, symbol);

    spaceIndex++;
  }

  function getUserSpaces(address user) public view returns (address[] memory) {
    return userSpaces[user];
  }

  function getUserLatestSpace(address user) public view returns (Space.SpaceInfo memory info) {
    address[] memory spaceAddresses = userSpaces[user];
    if (spaceAddresses.length > 0) {
      address spaceAddress = spaceAddresses[spaceAddresses.length - 1];
      info = Space(payable(spaceAddress)).getSpaceInfo();
    }
  }
}
