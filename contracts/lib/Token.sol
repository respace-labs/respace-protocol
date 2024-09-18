// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";
import "../interfaces/ISpace.sol";
import "./Events.sol";
import "./TransferUtil.sol";

library Token {
  using SafeERC20 for IERC20;

  uint256 public constant CREATOR_FEE_RATE = 0.006 * 1 ether; // 0.6%
  uint256 public constant PROTOCOL_FEE_RATE = 0.004 * 1 ether; // 0.4%

  // initial virtual eth amount
  uint256 public constant initialX = 30 * 1 ether;

  // initial virtual token amount
  uint256 public constant initialY = 1073000191 * 1 ether;

  uint256 public constant initialK = initialX * initialY;

  struct State {
    uint256 x;
    uint256 y;
    uint256 k;
  }

  function getTokenAmount(State memory self, uint256 ethAmount) public pure returns (BuyInfo memory info) {
    info.ethAmount = ethAmount;
    info.newX = self.x + ethAmount;
    info.newY = (self.k + info.newX - 1) / info.newX; // div up
    uint256 tokenAmount = self.y - info.newY;
    info.creatorFee = (tokenAmount * CREATOR_FEE_RATE) / 1 ether;
    info.protocolFee = (tokenAmount * PROTOCOL_FEE_RATE) / 1 ether;
    info.tokenAmountAfterFee = tokenAmount - info.creatorFee - info.protocolFee;
  }

  function getEthAmount(State memory self, uint256 tokenAmount) public pure returns (SellInfo memory info) {
    info.creatorFee = (tokenAmount * CREATOR_FEE_RATE) / 1 ether;
    info.protocolFee = (tokenAmount * PROTOCOL_FEE_RATE) / 1 ether;
    info.tokenAmountAfterFee = tokenAmount - info.creatorFee - info.protocolFee;
    info.newY = self.y + info.tokenAmountAfterFee;
    info.newX = (self.k + info.newY - 1) / info.newY; // div up
    info.ethAmount = self.x - info.newX;
  }

  function getEthAmountWithoutFee(State memory self, uint256 tokenAmount) public pure returns (uint256 ethAmount) {
    uint256 newY = self.y + tokenAmount;
    uint256 newX = (self.k + newY - 1) / newY; // div up
    ethAmount = self.x - newX;
  }

  function buy(State storage self, uint256 ethAmount, uint256 minTokenAmount) external returns (BuyInfo memory info) {
    require(ethAmount > 0, "ETH amount must be greater than zero");
    info = getTokenAmount(self, ethAmount);

    require(info.tokenAmountAfterFee >= minTokenAmount, "Slippage too high");

    self.x = info.newX;
    self.y = info.newY;
    self.k = info.newX * info.newY;
  }

  function sell(State storage self, uint256 tokenAmount, uint256 minEthAmount) external returns (SellInfo memory info) {
    require(tokenAmount > 0, "Token amount must be greater than zero");
    info = getEthAmount(self, tokenAmount);

    require(info.ethAmount >= minEthAmount, "Slippage too high");

    IERC20(address(this)).safeTransferFrom(msg.sender, address(this), tokenAmount);

    self.y = info.newY;
    self.x = info.newX;
    self.k = info.newX * info.newY;
  }
}
