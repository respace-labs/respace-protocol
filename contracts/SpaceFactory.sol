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

  address public immutable creationFactory;

  uint256 public price = 0.01024 * 1 ether;
  uint256 public spaceIndex = 0;
  address public feeReceiver;
  mapping(address => address[]) public userSpaces;
  mapping(uint256 spaceId => address) public spaces;

  event SpaceCreated(uint256 indexed spaceId, address founder, string spaceName, string symbol);
  event PriceUpdated(uint256 price);
  event FeeReceiverUpdated(address receiver);
  event WithdrawEther(address to, uint256 amount);
  event WithdrawToken(address to, uint256 amount);
  event Swap(address indexed account, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);

  constructor(address initialOwner, address _creationFactory) Ownable(initialOwner) {
    creationFactory = _creationFactory;
  }

  receive() external payable {}

  function setPrice(uint256 _price) external onlyOwner {
    price = _price;
    emit PriceUpdated(_price);
  }

  function setFeeReceiver(address _receiver) external onlyOwner {
    feeReceiver = _receiver;
    emit FeeReceiverUpdated(_receiver);
  }

  function createSpace(string calldata spaceName, string calldata symbol, uint256 preBuyEthAmount) external payable {
    require(msg.value >= price + preBuyEthAmount, "Insufficient payment");
    address founder = msg.sender;
    Space space = new Space(creationFactory, address(this), founder, spaceName, symbol, preBuyEthAmount);

    space.initialize();

    if (preBuyEthAmount > 0) {
      BuyInfo memory info = space.buy{ value: preBuyEthAmount }();
      IERC20(space).transfer(msg.sender, info.tokenAmountAfterFee);
    }

    spaces[spaceIndex] = address(space);
    userSpaces[msg.sender].push(address(space));
    emit SpaceCreated(spaceIndex, founder, spaceName, symbol);

    spaceIndex++;
  }

  function swap(address tokenIn, address tokenOut, uint256 amountIn) external returns (uint256 returnAmount) {
    IERC20(address(tokenIn)).safeTransferFrom(msg.sender, address(this), amountIn);
    IERC20(address(tokenIn)).approve(tokenIn, amountIn);
    SellInfo memory sellInfo = ISpace(tokenIn).sell(amountIn);
    BuyInfo memory buyInfo = ISpace(tokenOut).buy{ value: sellInfo.ethAmount }();
    returnAmount = buyInfo.tokenAmountAfterFee + buyInfo.creatorFee + buyInfo.protocolFee;
    IERC20(address(tokenOut)).transfer(msg.sender, returnAmount);
    emit Swap(msg.sender, tokenIn, tokenOut, amountIn, returnAmount);
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

  function withdrawEther() external onlyOwner {
    uint256 amount = address(this).balance;
    TransferUtil.safeTransferETH(feeReceiver, amount);
    emit WithdrawEther(feeReceiver, amount);
  }

  function withdrawTokens(address[] calldata tokens) external onlyOwner {
    for (uint256 i = 0; i < tokens.length; i++) {
      uint256 amount = IERC20(tokens[i]).balanceOf(address(this));
      IERC20(tokens[i]).transfer(feeReceiver, amount);
      emit WithdrawToken(feeReceiver, amount);
    }
  }
}
