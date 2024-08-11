// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

interface IFarmer {
  function deposit() external;

  function withdraw(uint256 amount) external;

  function balanceOf(address owner) external view returns (uint256 withdrawableETHAmount);

  function yieldToken() external view returns (address);

  function yieldMaxClaimable(uint256 depositedETHAmount) external view returns (uint256 maxClaimableETH);
}
