// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Space.sol";
import "./lib/Events.sol";
import "./interfaces/ISpace.sol";
import "hardhat/console.sol";

contract SpaceFactory is Ownable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  uint256 public price = 0.01024 * 1 ether;
  uint256 public spaceIndex = 0;
  address public feeReceiver;
  mapping(address => address[]) public userSpaces;
  mapping(uint256 spaceId => address) public spaces;
  mapping(address => address) public spaceToFounder;

  constructor(address initialOwner) Ownable(initialOwner) {}

  receive() external payable {}

  function setPrice(uint256 _price) external onlyOwner {
    price = _price;
    emit Events.PriceUpdated(_price);
  }

  function setFeeReceiver(address _receiver) external onlyOwner {
    feeReceiver = _receiver;
    emit Events.FeeReceiverUpdated(_receiver);
  }

  function createSpace(
    string calldata spaceName,
    string calldata symbol,
    uint256 preBuyEthAmount
  ) external payable nonReentrant {
    require(msg.value >= price + preBuyEthAmount, "Insufficient payment");
    address founder = msg.sender;
    Space space = new Space(address(this), founder, spaceName, symbol);

    space.initialize();

    uint256 currentSpaceIndex = spaceIndex;
    spaces[currentSpaceIndex] = address(space);
    userSpaces[msg.sender].push(address(space));
    spaceToFounder[address(space)] = founder;
    emit Events.SpaceCreated(currentSpaceIndex, founder, spaceName, symbol, preBuyEthAmount);

    unchecked {
      spaceIndex = currentSpaceIndex + 1;
    }

    if (preBuyEthAmount > 0) {
      BuyInfo memory info = space.buy{ value: preBuyEthAmount }(0);
      IERC20(space).transfer(msg.sender, info.tokenAmountAfterFee);
    }
  }

  function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minTokenAmount
  ) external nonReentrant returns (uint256 returnAmount) {
    // Verify that input and output tokens are registered Space tokens and not the same
    require(isRegisteredSpace(tokenIn) && isRegisteredSpace(tokenOut) && tokenIn != tokenOut, "Invalid tokens");
    IERC20(address(tokenIn)).safeTransferFrom(msg.sender, address(this), amountIn);
    IERC20(address(tokenIn)).approve(tokenIn, amountIn);
    SellInfo memory sellInfo = ISpace(tokenIn).sell(amountIn, 0);
    BuyInfo memory buyInfo = ISpace(tokenOut).buy{ value: sellInfo.ethAmount }(minTokenAmount);
    returnAmount = buyInfo.tokenAmountAfterFee + buyInfo.creatorFee + buyInfo.protocolFee;
    IERC20(address(tokenOut)).transfer(msg.sender, returnAmount);
    emit Events.Swap(msg.sender, tokenIn, tokenOut, amountIn, returnAmount);
  }

  function getUserSpaces(address user) external view returns (address[] memory) {
    return userSpaces[user];
  }

  function withdrawEther() external onlyOwner {
    uint256 amount = address(this).balance;
    TransferUtil.safeTransferETH(feeReceiver, amount);
    emit Events.WithdrawEther(feeReceiver, amount);
  }

  function withdrawTokens(address[] calldata tokens) external onlyOwner {
    for (uint256 i = 0; i < tokens.length; i++) {
      uint256 amount = IERC20(tokens[i]).balanceOf(address(this));
      IERC20(tokens[i]).transfer(feeReceiver, amount);
      emit Events.WithdrawToken(feeReceiver, amount);
    }
  }

  function isRegisteredSpace(address spaceAddress) public view returns (bool) {
    return spaceToFounder[spaceAddress] != address(0);
  }
}
