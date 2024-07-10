// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";
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

  function deposit() external override {
    //
  }

  function withdraw(uint256 amount) external override {
    console.log(">>>>>>>>>>++++++:", amount);
    _safeTransferETH(FACTORY, amount);
  }

  function balanceOf(address owner) external view override returns (uint256 withdrawableETHAmount) {
    return 0;
  }

  function yieldToken() external view override returns (address) {
    return address(0);
  }

  function yieldMaxClaimable(uint256 depositedETHAmount) external view returns (uint256 maxClaimableETH) {
    return 0;
  }

  function _safeTransferETH(address to, uint256 value) internal {
    (bool success, ) = to.call{ value: value }(new bytes(0));
    require(success, "ETH transfer failed");
  }
}
