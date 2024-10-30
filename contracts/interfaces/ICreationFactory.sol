// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

struct Creation {
  uint256 id;
  address creator;
  string uri;
  uint256 price;
}

interface ICreationFactory {
  function create(address creator, string calldata uri, uint256 price) external returns (uint256 creationId);

  function mint(
    uint256 creationId,
    uint32 amount,
    address curator,
    string calldata mark
  ) external payable returns (uint256 creatorFee, uint256 protocolFee, uint256 curatorFee);

  function getUserCreations(address creator) external view returns (uint256[] memory);

  function getUserLatestCreation(address creator) external view returns (Creation memory creation);

  function creationSupply(uint256 id) external view returns (uint256);

  function setProtocolFeeTo(address _feeTo) external;

  function setFeePercent(uint256 _creatorFeePercent, uint256 _curatorFeePercent, uint256 _protocolFeePercent) external;

  function updateCreation(uint256 id, string calldata uri, uint256 price) external;
}
