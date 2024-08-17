// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";
import "./TransferUtil.sol";

library Token {
  using SafeERC20 for IERC20;

  uint256 public constant FEE_RATE = 1; // 1%

  // initial virtual eth amount
  uint256 public constant initialX = 30 * 1 ether;
  // initial virtual token amount
  uint256 public constant initialY = 1073000191 * 1 ether;

  uint256 public constant initialK = 32190005730 * 1 ether * 1 ether;

  struct State {
    uint256 x;
    uint256 y;
    uint256 k;
  }

  enum TradeType {
    Buy,
    Sell
  }

  event Trade(
    TradeType indexed tradeType,
    address indexed account,
    uint256 ethAmount,
    uint256 tokenAmount,
    uint256 fee
  );

  function getTokenPrice(State storage self) public view returns (uint256) {
    return self.y - self.k / (self.x + 1 ether);
  }

  function getTokenAmount(
    State storage self,
    uint256 ethAmount
  ) public view returns (uint256 tokenAmount, uint256 newX, uint256 newY, uint256 fee) {
    fee = (ethAmount * FEE_RATE) / 100;
    uint256 ethAmountAfterFee = ethAmount - fee;
    newX = self.x + ethAmountAfterFee;
    newY = self.k / newX;
    tokenAmount = self.y - newY;
  }

  function getEthAmount(
    State storage self,
    uint256 tokenAmount
  ) public view returns (uint256 ethAmount, uint256 tokenAmountAfterFee, uint256 newX, uint256 newY, uint256 fee) {
    fee = (tokenAmount * FEE_RATE) / 100;
    tokenAmountAfterFee = tokenAmount - fee;
    newY = self.y + tokenAmountAfterFee;
    newX = self.k / newY;
    ethAmount = self.x - newX;
  }

  function buy(State storage self) external returns (uint256) {
    uint256 ethAmount = msg.value;
    require(ethAmount > 0, "ETH amount must be greater than zero");

    (uint256 tokenAmount, uint256 newX, uint256 newY, uint256 fee) = getTokenAmount(self, ethAmount);

    self.x = newX;
    self.y = newY;

    emit Trade(TradeType.Buy, msg.sender, ethAmount, tokenAmount, fee);
    return tokenAmount;
  }

  function sell(State storage self, uint256 tokenAmount) external returns (uint256) {
    require(tokenAmount > 0, "Token amount must be greater than zero");

    (uint256 ethAmount, uint256 tokenAmountAfterFee, uint256 newX, uint256 newY, uint256 fee) = getEthAmount(
      self,
      tokenAmount
    );

    self.y = newY;
    self.x = newX;

    IERC20(address(this)).transferFrom(msg.sender, address(this), tokenAmount);
    TransferUtil.safeTransferETH(msg.sender, ethAmount);

    emit Trade(TradeType.Sell, msg.sender, ethAmount, tokenAmount, fee);
    return tokenAmountAfterFee;
  }
}
