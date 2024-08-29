// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";
import "./TransferUtil.sol";

library Token {
  using SafeERC20 for IERC20;

  uint256 public constant INSURANCE_FEE_RATE = 0.001 * 1 ether; // 0.1%
  uint256 public constant CREATOR_FEE_RATE = 0.006 * 1 ether; // 0.6%
  uint256 public constant PROTOCOL_FEE_RATE = 0.004 * 1 ether; // 0.4%

  // initial virtual eth amount
  uint256 public constant initialX = 30 * 1 ether;
  // initial virtual token amount
  uint256 public constant initialY = 1073000191 * 1 ether;

  uint256 public constant initialK = 32190005730 * 1 ether * 1 ether;

  struct State {
    uint256 x;
    uint256 y;
    uint256 k;
    uint256 insuranceEthAmount;
    uint256 insuranceTokenAmount;
  }

  struct BuyInfo {
    uint256 newX;
    uint256 newY;
    uint256 ethAmount;
    uint256 tokenAmountAfterFee;
    uint256 creatorFee;
    uint256 protocolFee;
    uint256 insuranceFee;
  }

  struct SellInfo {
    uint256 newX;
    uint256 newY;
    uint256 ethAmount;
    uint256 tokenAmountAfterFee;
    uint256 creatorFee;
    uint256 protocolFee;
    uint256 insuranceFee;
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
    uint256 creatorFee,
    uint256 protocolFee
  );

  function getTokenPrice(State storage self) public view returns (uint256) {
    return self.y - self.k / (self.x + 1 ether);
  }

  function getTokenAmount(State storage self, uint256 ethAmount) public view returns (BuyInfo memory info) {
    info.ethAmount = ethAmount;
    info.insuranceFee = (ethAmount * INSURANCE_FEE_RATE) / 1 ether;
    uint256 tradableEthAmount = ethAmount - info.insuranceFee;
    info.newX = self.x + tradableEthAmount;
    info.newY = self.k / info.newX;
    uint256 tokenAmount = self.y - info.newY;
    info.creatorFee = (tokenAmount * CREATOR_FEE_RATE) / 1 ether;
    info.protocolFee = (tokenAmount * PROTOCOL_FEE_RATE) / 1 ether;
    info.tokenAmountAfterFee = tokenAmount - info.creatorFee - info.protocolFee;
  }

  function getEthAmount(State storage self, uint256 tokenAmount) public view returns (SellInfo memory info) {
    info.insuranceFee = (tokenAmount * INSURANCE_FEE_RATE) / 1 ether;
    info.creatorFee = (tokenAmount * CREATOR_FEE_RATE) / 1 ether;
    info.protocolFee = (tokenAmount * PROTOCOL_FEE_RATE) / 1 ether;
    info.tokenAmountAfterFee = tokenAmount - info.creatorFee - info.protocolFee - info.insuranceFee;
    info.newY = self.y + info.tokenAmountAfterFee;
    info.newX = self.k / info.newY;
    info.ethAmount = self.x - info.newX;
  }

  function buy(State storage self, uint256 ethAmount) external returns (BuyInfo memory info) {
    require(ethAmount > 0, "ETH amount must be greater than zero");
    info = getTokenAmount(self, ethAmount);
    self.x = info.newX;
    self.y = info.newY;
    self.insuranceEthAmount += info.insuranceFee;
  }

  function sell(State storage self, uint256 tokenAmount) external returns (SellInfo memory info) {
    require(tokenAmount > 0, "Token amount must be greater than zero");
    info = getEthAmount(self, tokenAmount);

    IERC20(address(this)).safeTransferFrom(msg.sender, address(this), tokenAmount);

    self.y = info.newY;
    self.x = info.newX;
    self.insuranceTokenAmount += info.insuranceFee;
  }
}
