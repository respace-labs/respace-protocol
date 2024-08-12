// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Token is ERC20, ERC20Permit, ReentrancyGuard {
  event Trade(
    TradeType indexed tradeType,
    address indexed account,
    uint256 ethAmount,
    uint256 tokenAmount,
    uint256 fee
  );

  enum TradeType {
    Buy,
    Sell
  }

  uint256 public constant k = 32190005730 * 1 ether * 1 ether;

  // initial virtual eth amount
  uint256 public constant initialX = 30 * 1 ether;
  // initial virtual token amount
  uint256 public constant initialY = 1073000191 * 1 ether;

  uint256 public x = initialX;
  uint256 public y = initialY;

  uint256 public constant FEE_RATE = 1; // 1%

  address public immutable founder;

  constructor(address _founder, string memory _name, string memory _symbol) ERC20(_name, _symbol) ERC20Permit(_name) {
    founder = _founder;
  }

  modifier onlyFounder() {
    require(msg.sender == founder, "Only Founder");
    _;
  }

  fallback() external payable {}

  receive() external payable {}

  function buy() public payable nonReentrant {
    uint256 ethAmount = msg.value;
    require(ethAmount > 0, "ETH amount must be greater than zero");

    uint256 fee = (ethAmount * FEE_RATE) / 100;
    uint256 ethAmountAfterFee = ethAmount - fee;

    uint256 newX = x + ethAmountAfterFee;
    uint256 newY = k / newX;
    uint256 tokenAmount = y - newY;

    x = newX;
    y = newY;

    _mint(msg.sender, tokenAmount);

    emit Trade(TradeType.Buy, msg.sender, ethAmount, tokenAmount, fee);
  }

  function sell(uint256 tokenAmount) public payable nonReentrant {
    require(tokenAmount > 0, "Token amount must be greater than zero");

    uint256 fee = (tokenAmount * FEE_RATE) / 100;
    uint256 tokenAmountAfterFee = tokenAmount - fee;

    uint256 newY = y + tokenAmountAfterFee;
    uint256 newX = k / newY;
    uint256 ethAmount = x - newX;

    y = newY;
    x = newX;

    IERC20(this).transferFrom(msg.sender, address(this), tokenAmount);
    _burn(address(this), tokenAmountAfterFee);

    _safeTransferETH(msg.sender, ethAmount);

    emit Trade(TradeType.Sell, msg.sender, ethAmount, tokenAmount, fee);
  }

  function getExcessEth() public view returns (uint256) {
    uint256 ethAmount = x - initialX;
    return address(this).balance - ethAmount;
  }

  function getExcessToken() public view returns (uint256) {
    return balanceOf(address(this));
  }

  function withdrawExcessEth() external onlyFounder {
    uint256 excessEth = getExcessEth();
    require(excessEth > 0, "No excess ETH to withdraw");
    _safeTransferETH(founder, excessEth);
  }

  function withdrawExcessToken() external onlyFounder {
    uint256 excessToken = getExcessToken();
    require(excessToken > 0, "No excess PENX to withdraw");
    IERC20(this).transfer(founder, excessToken);
  }

  function _safeTransferETH(address to, uint256 value) internal {
    (bool success, ) = to.call{ value: value }(new bytes(0));
    require(success, "ETH transfer failed");
  }
}
