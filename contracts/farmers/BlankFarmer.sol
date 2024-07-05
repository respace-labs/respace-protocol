// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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
    //
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
  //
}
