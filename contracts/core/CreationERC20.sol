// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract CreationERC20 is ERC20, ERC20Permit {
  address private factory;

  constructor(
    address _factory,
    string memory _symbol,
    address _creator,
    uint256 _initialSupply
  ) ERC20("A creation", _symbol) ERC20Permit(_symbol) {
    _mint(_creator, _initialSupply);
    factory = _factory;
  }

  modifier onlyFactory() {
    require(msg.sender == factory, "Only factory");
    _;
  }

  function mint(address to, uint256 amount) external onlyFactory {
    _mint(to, amount);
  }

  function burn(address from, uint256 amount) external onlyFactory {
    _burn(from, amount);
  }
}
