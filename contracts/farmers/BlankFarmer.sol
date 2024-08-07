// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IFarmer.sol";

contract BlankFarmer is IFarmer {
  address public immutable FACTORY;

  constructor(address _factory) {
    FACTORY = _factory;
  }

  modifier onlyFactory() {
    require(msg.sender == FACTORY, "Only Factory");
    _;
  }

  fallback() external payable {}

  receive() external payable {}

  function deposit() external override onlyFactory {
    //
  }

  function withdraw(address token, uint256 amount) external override onlyFactory {
    IERC20(token).transfer(FACTORY, amount);
  }

  function balanceOf(address owner) external view override returns (uint256 withdrawableETHAmount) {
    return 0;
  }

  function yieldToken() external view override onlyFactory returns (address) {
    return address(0);
  }

  function yieldMaxClaimable(uint256 depositedETHAmount) external view returns (uint256 maxClaimableETH) {
    return 0;
  }
}
