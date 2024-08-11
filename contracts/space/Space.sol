// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IIndieX.sol";
import "./TokenFactory.sol";
import "hardhat/console.sol";

contract Space is Ownable, ERC1155Holder {
  struct SpaceInfo {
    string name;
    string symbol;
    address token;
    uint256 creationId;
    uint256 sponsorCreationId;
  }

  string public name;
  string public symbol;
  address token;
  uint256 public creationId;
  uint256 public sponsorCreationId;

  constructor(address initialOwner) Ownable(initialOwner) {}

  function create(
    address indieX,
    string calldata _spaceName,
    string calldata _symbol,
    IIndieX.NewCreationInput memory creationInput,
    IIndieX.NewCreationInput memory sponsorCreationInput
  ) external {
    name = _spaceName;
    symbol = _symbol;

    TokenFactory _token = new TokenFactory(owner(), _spaceName, _symbol);
    token = address(_token);

    creationId = IIndieX(indieX).newCreation(creationInput);
    sponsorCreationId = IIndieX(indieX).newCreation(sponsorCreationInput);

    console.log("===>>>>creationId:", creationId, "sponsorCreationId:", sponsorCreationId);

    console.log("token:", address(token));
  }

  function getInfo() external view returns (SpaceInfo memory) {
    return SpaceInfo(name, symbol, token, creationId, sponsorCreationId);
  }

  function claim() external {
    //
  }

  function distribute() external {
    //
  }
}
