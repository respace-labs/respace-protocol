// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Space.sol";
import "./interfaces/ISpace.sol";
import "hardhat/console.sol";

contract SpaceFactory is Ownable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  uint256 public spaceIndex = 0;
  mapping(address => address[]) public userSpaces;
  mapping(uint256 spaceId => address) public spaces;

  event Create(uint256 indexed spaceId, address creator, string spaceName, string symbol);

  constructor(address initialOwner) Ownable(initialOwner) {}

  receive() external payable {}

  function createSpace(string calldata spaceName, string calldata symbol) external {
    address founder = msg.sender;
    Space space = new Space(founder, spaceName, symbol);

    space.initialize();

    spaces[spaceIndex] = address(space);
    userSpaces[msg.sender].push(address(space));
    emit Create(spaceIndex, founder, spaceName, symbol);

    spaceIndex++;
  }

  function swap(address _tokenIn, address _tokenOut, uint256 amountIn) external returns (uint256 returnAmount) {
    IERC20(address(_tokenIn)).safeTransferFrom(msg.sender, address(this), amountIn);
    IERC20(address(_tokenIn)).approve(_tokenIn, amountIn);
    (, uint256 ethAmount) = ISpace(_tokenIn).sell(amountIn);
    returnAmount = ISpace(_tokenOut).buy{ value: ethAmount }();
    IERC20(address(_tokenOut)).transfer(msg.sender, returnAmount);
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
