// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

interface IIndieX {
  struct UpsertAppInput {
    string name;
    string uri;
    address feeTo;
    uint256 appFeePercent;
    uint256 creatorFeePercent;
  }

  struct App {
    uint256 id;
    address creator;
    string name;
    string uri;
    address feeTo;
    uint256 appFeePercent;
    uint256 creatorFeePercent;
  }

  struct NewCreationInput {
    uint256 appId;
    string name;
    string uri;
    uint256 curatorFeePercent;
    Curve curve;
    uint8 farmer;
    bool isFarming;
  }

  struct UpdateCreationInput {
    string name;
    string uri;
    uint256 curatorFeePercent;
  }

  struct Creation {
    uint256 id;
    uint256 appId;
    address creator;
    string name;
    string uri;
    uint256 curatorFeePercent;
    Curve curve;
    uint8 farmer;
    bool isFarming;
    uint256 balance;
    uint256 volume;
  }

  struct Curve {
    uint96 basePrice;
    uint32 inflectionPoint;
    uint128 inflectionPrice;
    uint128 linearPriceSlope;
  }

  struct PriceInfo {
    uint256 priceAfterFee;
    uint256 price;
    uint256 creatorFee;
    uint256 appFee;
    uint256 protocolFee;
  }

  event NewApp(
    uint256 id,
    address indexed creator,
    string name,
    string uri,
    address feeTo,
    uint256 appFeePercent,
    uint256 creatorFeePercent
  );

  event UpdateApp(
    uint256 id,
    address indexed creator,
    string name,
    string uri,
    address feeTo,
    uint256 appFeePercent,
    uint256 creatorFeePercent
  );

  event NewCreation(
    uint256 indexed creationId,
    address indexed creator,
    uint256 indexed appId,
    string name,
    string uri,
    Curve curve,
    uint8 farmerId,
    bool isFarming
  );

  event UpdateCreation(
    uint256 indexed creationId,
    address indexed creator,
    uint256 indexed appId,
    string name,
    string uri
  );

  event Trade(
    TradeType indexed tradeType,
    uint256 indexed creationId,
    address indexed sender,
    uint256 tokenAmount,
    uint256 fundAmount,
    uint256 creatorFee,
    uint256 appFee,
    uint256 protocolFee,
    address curator,
    uint256 curatorFee
  );

  event FarmerAdded(uint8 indexed farmerIndex, address indexed farmer);
  event ProtocolFeeToUpdated(address indexed previousFeeTo, address indexed newFeeTo);
  event ProtocolFeePercentUpdated(uint256 previousFeePercent, uint256 newFeePercent);

  enum TradeType {
    Mint,
    Buy,
    Sell
  }

  function newApp(UpsertAppInput memory input) external;

  function updateApp(uint256 id, UpsertAppInput memory input) external;

  function newCreation(NewCreationInput memory input) external;

  function updateCreation(uint256 id, UpdateCreationInput memory input) external;

  function buy(uint256 creationId, uint32 amount, address curator) external payable;

  function sell(uint256 creationId, uint32 amount) external;

  function getBuyPrice(uint256 creationId, uint32 amount) external view returns (uint256);

  function getSellPrice(uint256 creationId, uint32 amount) external view returns (uint256);

  function getBuyPriceAfterFee(
    uint256 creationId,
    uint32 amount,
    uint256 appId
  ) external view returns (PriceInfo memory);

  function getSellPriceAfterFee(
    uint256 creationId,
    uint32 amount,
    uint256 appId
  ) external view returns (PriceInfo memory);

  function getApp(uint256 id) external view returns (App memory);

  function getCreation(uint256 id) external view returns (Creation memory);

  function getUserCreations(address creator) external view returns (uint256[] memory);

  function creationSupply(uint256 id) external view returns (uint256);

  function getUserLatestCreation(address creator) external view returns (Creation memory creation);

  function getSubTotal(Creation memory creation, uint32 fromSupply, uint32 quantity) external pure returns (uint256);
}
