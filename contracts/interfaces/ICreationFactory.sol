// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

struct Creation {
  uint256 id;
  address creator;
  string uri;
  uint256 price;
}

interface ICreationFactory {
  function create(string calldata uri, uint256 price) external returns (uint256 creationId);

  function mint(uint256 creationId, uint32 amount, address curator) external payable;

  function getCreation(uint256 id) external view returns (Creation memory);

  function getUserCreations(address creator) external view returns (uint256[] memory);

  function getUserLatestCreation(address creator) external view returns (Creation memory creation);

  function creationSupply(uint256 id) external view returns (uint256);

  function setProtocolFeeTo(address _feeTo) external;

  function setFeePercent(uint256 _creatorFeePercent, uint256 _curatorFeePercent, uint256 _protocolFeePercent) external;

  function updateURI(uint256 id, string calldata uri) external;
}
