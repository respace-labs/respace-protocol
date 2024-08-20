// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";
import "./TransferUtil.sol";

library Token {
  using SafeERC20 for IERC20;

  uint256 public constant INSURANCE_FEE_RATE = 0.001 * 1 ether; // 0.1%
  uint256 public constant PROTOCOL_FEE_RATE = 0.01 * 1 ether; // 1%

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

  enum TradeType {
    Buy,
    Sell
  }

  event Trade(
    TradeType indexed tradeType,
    address indexed account,
    uint256 ethAmount,
    uint256 tokenAmount,
    uint256 protocolFee
  );

  function getTokenPrice(State storage self) public view returns (uint256) {
    return self.y - self.k / (self.x + 1 ether);
  }

  function getTokenAmount(
    State storage self,
    uint256 ethAmount
  )
    public
    view
    returns (uint256 tokenAmountAfterFee, uint256 newX, uint256 newY, uint256 protocolFee, uint256 insuranceFee)
  {
    insuranceFee = (ethAmount * INSURANCE_FEE_RATE) / 1 ether;
    uint256 tradableEthAmount = ethAmount - insuranceFee;
    newX = self.x + tradableEthAmount;
    newY = self.k / newX;
    uint256 tokenAmount = self.y - newY;
    protocolFee = (ethAmount * PROTOCOL_FEE_RATE) / 1 ether;
    tokenAmountAfterFee = tokenAmount - protocolFee;
  }

  function getEthAmount(
    State storage self,
    uint256 tokenAmount
  )
    public
    view
    returns (
      uint256 ethAmount,
      uint256 tokenAmountAfterFee,
      uint256 newX,
      uint256 newY,
      uint256 protocolFee,
      uint256 insuranceFee
    )
  {
    insuranceFee = (tokenAmount * INSURANCE_FEE_RATE) / 1 ether;
    protocolFee = (tokenAmount * PROTOCOL_FEE_RATE) / 1 ether;
    tokenAmountAfterFee = tokenAmount - protocolFee - insuranceFee;
    newY = self.y + tokenAmountAfterFee;
    newX = self.k / newY;
    ethAmount = self.x - newX;
  }

  function buy(State storage self, uint256 ethAmount) external returns (uint256, uint256) {
    require(ethAmount > 0, "ETH amount must be greater than zero");

    (uint256 tokenAmount, uint256 newX, uint256 newY, uint256 protocolFee, uint256 insuranceFee) = getTokenAmount(
      self,
      ethAmount
    );

    self.x = newX;
    self.y = newY;
    self.insuranceEthAmount += insuranceFee;

    emit Trade(TradeType.Buy, msg.sender, ethAmount, tokenAmount, protocolFee);
    return (tokenAmount, protocolFee);
  }

  function sell(State storage self, uint256 tokenAmount) external returns (uint256, uint256, uint256) {
    require(tokenAmount > 0, "Token amount must be greater than zero");

    (
      uint256 ethAmount,
      uint256 tokenAmountAfterFee,
      uint256 newX,
      uint256 newY,
      uint256 protocolFee,
      uint256 insuranceFee
    ) = getEthAmount(self, tokenAmount);

    self.y = newY;
    self.x = newX;
    self.insuranceTokenAmount += insuranceFee;

    IERC20(address(this)).safeTransferFrom(msg.sender, address(this), tokenAmount);

    TransferUtil.safeTransferETH(msg.sender, ethAmount);

    emit Trade(TradeType.Sell, msg.sender, ethAmount, tokenAmount, protocolFee);
    return (tokenAmountAfterFee, ethAmount, protocolFee);
  }
}
