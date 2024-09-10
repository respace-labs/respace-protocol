// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";
import "../interfaces/ISpaceFactory.sol";
import "../interfaces/ISpace.sol";
import "../Space.sol";
import "./Events.sol";
import "./TransferUtil.sol";

library SpaceHelper {
  using SafeERC20 for IERC20;

  function createApp(
    mapping(uint256 => App) storage apps,
    uint256 appIndex,
    string calldata _uri,
    address _feeReceiver,
    uint256 _feePercent
  ) external {
    require(_feeReceiver != address(0), "Invalid feeTo address");
    require(_feePercent <= 0.05 ether, "appFeePercent must be <= 5%");
    apps[appIndex] = App(msg.sender, _uri, _feeReceiver, _feePercent);
  }

  function updateApp(
    mapping(uint256 => App) storage apps,
    uint256 id,
    string calldata _uri,
    address _feeReceiver,
    uint256 _feePercent
  ) external {
    App storage app = apps[id];
    require(app.creator != address(0), "App not existed");
    require(app.creator == msg.sender, "Only creator can update App URI");
    require(_feeReceiver != address(0), "Invalid feeTo address");
    require(_feePercent <= 0.05 ether, "appFeePercent must be <= 5%");
    app.uri = _uri;
    app.feeReceiver = _feeReceiver;
    app.feePercent = _feePercent;
  }

  function swap(
    mapping(address => address) storage spaceToFounder,
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minTokenAmount
  ) external returns (uint256 returnAmount) {
    require(
      isSpace(spaceToFounder, tokenIn) && isSpace(spaceToFounder, tokenOut) && tokenIn != tokenOut,
      "Invalid tokens"
    );
    IERC20(address(tokenIn)).safeTransferFrom(msg.sender, address(this), amountIn);
    IERC20(address(tokenIn)).approve(tokenIn, amountIn);
    SellInfo memory sellInfo = ISpace(tokenIn).sell(amountIn, 0);
    BuyInfo memory buyInfo = ISpace(tokenOut).buy{ value: sellInfo.ethAmount }(minTokenAmount);
    returnAmount = buyInfo.tokenAmountAfterFee + buyInfo.creatorFee + buyInfo.protocolFee;
    IERC20(address(tokenOut)).transfer(msg.sender, returnAmount);
  }

  function withdrawEther(address feeReceiver) external returns (uint256 amount) {
    amount = address(this).balance;
    TransferUtil.safeTransferETH(feeReceiver, amount);
  }

  function withdrawTokens(address feeReceiver, address[] calldata tokens) external {
    for (uint256 i = 0; i < tokens.length; i++) {
      uint256 amount = IERC20(tokens[i]).balanceOf(address(this));
      IERC20(tokens[i]).transfer(feeReceiver, amount);
      emit Events.WithdrawToken(feeReceiver, tokens[i], amount);
    }
  }

  function isSpace(
    mapping(address => address) storage spaceToFounder,
    address spaceAddress
  ) public view returns (bool) {
    return spaceToFounder[spaceAddress] != address(0);
  }
}
