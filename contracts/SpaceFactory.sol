// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./Space.sol";
import "./interfaces/ISpace.sol";
import "hardhat/console.sol";

contract SpaceFactory is Ownable, Pausable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  uint256 public price = 0.01024 * 1 ether;
  uint256 public spaceIndex = 0;
  address public feeReceiver;
  mapping(address => address[]) public userSpaces;
  mapping(uint256 spaceId => address) public spaces;
  mapping(address => address) public spaceToFounder;

  event SpaceCreated(uint256 indexed spaceId, address founder, string spaceName, string symbol);
  event PriceUpdated(uint256 price);
  event FeeReceiverUpdated(address receiver);
  event WithdrawEther(address indexed to, uint256 amount);
  event WithdrawToken(address indexed to, uint256 amount);
  event Swap(address indexed account, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);

  constructor(address initialOwner) Ownable(initialOwner) {}

  receive() external payable {}

  function pause() public onlyOwner {
    _pause();
  }

  function unpause() public onlyOwner {
    _unpause();
  }

  function setPrice(uint256 _price) external onlyOwner {
    price = _price;
    emit PriceUpdated(_price);
  }

  function setFeeReceiver(address _receiver) external onlyOwner {
    feeReceiver = _receiver;
    emit FeeReceiverUpdated(_receiver);
  }

  function createSpace(
    string calldata spaceName,
    string calldata symbol,
    uint256 preBuyEthAmount
  ) external payable whenNotPaused nonReentrant {
    require(msg.value >= price + preBuyEthAmount, "Insufficient payment");
    address founder = msg.sender;
    Space space = new Space(address(this), founder, spaceName, symbol, preBuyEthAmount);

    space.initialize();

    uint256 currentSpaceIndex = spaceIndex;
    spaces[currentSpaceIndex] = address(space);
    userSpaces[msg.sender].push(address(space));
    spaceToFounder[address(space)] = founder;
    emit SpaceCreated(currentSpaceIndex, founder, spaceName, symbol);

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
  ) external whenNotPaused nonReentrant returns (uint256 returnAmount) {
    // Verify that input and output tokens are registered Space tokens and not the same
    require(isRegisteredSpace(tokenIn) && isRegisteredSpace(tokenOut) && tokenIn != tokenOut, "Invalid tokens");
    IERC20(address(tokenIn)).safeTransferFrom(msg.sender, address(this), amountIn);
    IERC20(address(tokenIn)).approve(tokenIn, amountIn);
    SellInfo memory sellInfo = ISpace(tokenIn).sell(amountIn, 0);
    BuyInfo memory buyInfo = ISpace(tokenOut).buy{ value: sellInfo.ethAmount }(minTokenAmount);
    returnAmount = buyInfo.tokenAmountAfterFee + buyInfo.creatorFee + buyInfo.protocolFee;
    IERC20(address(tokenOut)).transfer(msg.sender, returnAmount);
    emit Swap(msg.sender, tokenIn, tokenOut, amountIn, returnAmount);
  }

  function getUserSpaces(address user) external view returns (address[] memory) {
    return userSpaces[user];
  }

  function getUserLatestSpace(address user) external view returns (Space.SpaceInfo memory info) {
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

  function isRegisteredSpace(address spaceAddress) public view returns (bool) {
    return spaceToFounder[spaceAddress] != address(0);
  }
}
