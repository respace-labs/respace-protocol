// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract USDC is ERC20 {
  uint8 tokenDecimals = 6;

  constructor() ERC20("Mock USDC", "USDC") {}

  receive() external payable {}

  fallback() external payable {}

  function mint(address account, uint256 amount) external {
    _mint(account, amount);
  }

  function burn(address account, uint256 amount) external {
    _burn(account, amount);
  }

  function decimals() public view override returns (uint8) {
    return tokenDecimals;
  }
}
