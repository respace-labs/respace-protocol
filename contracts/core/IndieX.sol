// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "../interfaces/ICurve.sol";
import "../interfaces/IFarmer.sol";

contract IndieX is Ownable, ERC1155, ERC1155Supply, ReentrancyGuard {
  using SafeERC20 for IERC20;

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
    uint256 appFeePercent; // default 0.02 ether, 2%
    uint256 creatorFeePercent; // 0.05 ether, 5%
  }

  struct NewCreationInput {
    string name;
    string uri;
    uint256 appId;
    uint8 farmer;
    bool isFarming;
    uint8 curve;
    uint256[] curveArgs;
  }

  struct UpdateCreationInput {
    string name;
    string uri;
  }

  struct Creation {
    uint256 id;
    uint256 appId;
    address creator;
    string name;
    string uri;
    uint8 farmer;
    bool isFarming;
    uint8 curve;
    uint256[] curveArgs;
    uint256 balance;
    uint256 volume;
  }

  uint8 public curveIndex = 0;
  mapping(uint8 curveId => address curve) public curves;

  uint8 public farmerIndex = 0;
  mapping(uint8 farmerId => address farmer) public farmers;

  uint256 public appIndex;
  mapping(uint256 appId => App) public apps;

  uint256 public creationIndex;
  mapping(uint256 creationId => Creation creation) public creations;

  mapping(address account => uint256[] creationId) public userCreations;

  uint256 ethAmount = 0;

  uint256 public constant CREATOR_PREMINT = 1 ether;
  uint256 public protocolFeePercent = 0.005 ether; // 0.5%

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
    uint8 farmerId,
    bool isFarming,
    uint8 curveId,
    uint256[] curveArgs
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
    uint256 appFee
  );

  enum TradeType {
    Mint,
    Buy,
    Sell
  }

  constructor(address initialOwner) ERC1155("") Ownable(initialOwner) {}

  fallback() external payable {}

  receive() external payable {}

  function addCurve(address curve) external {
    curves[curveIndex] = curve;
    curveIndex++;
  }

  function addFarmer(address farmer) external {
    farmers[farmerIndex] = farmer;
    farmerIndex++;
  }

  function newApp(UpsertAppInput memory input) external {
    apps[appIndex] = App(
      appIndex,
      msg.sender,
      input.name,
      input.uri,
      input.feeTo,
      input.appFeePercent,
      input.creatorFeePercent
    );

    emit NewApp(appIndex, msg.sender, input.name, input.uri, input.feeTo, input.appFeePercent, input.creatorFeePercent);

    appIndex++;
  }

  function updateApp(uint256 id, UpsertAppInput memory input) external {
    App storage app = apps[id];
    require(app.creator != address(0), "App not existed");
    require(app.creator == msg.sender, "Only creator can update App");
    apps[appIndex] = App(
      app.id,
      msg.sender,
      input.name,
      input.uri,
      input.feeTo,
      input.appFeePercent,
      input.creatorFeePercent
    );
    emit UpdateApp(
      app.id,
      msg.sender,
      input.name,
      input.uri,
      input.feeTo,
      input.appFeePercent,
      input.creatorFeePercent
    );
  }

  function newCreation(NewCreationInput memory input) public {
    address creator = msg.sender;
    creations[creationIndex] = Creation(
      creationIndex,
      input.appId,
      creator,
      input.name,
      input.uri,
      input.farmer,
      input.isFarming,
      input.curve,
      input.curveArgs,
      0,
      0
    );
    userCreations[creator].push(creationIndex);
    _mint(msg.sender, creationIndex, CREATOR_PREMINT, "");
    emit NewCreation(
      creationIndex,
      creator,
      input.appId,
      input.name,
      input.uri,
      input.farmer,
      input.isFarming,
      input.curve,
      input.curveArgs
    );

    creationIndex++;
  }

  function updateCreation(uint256 id, UpdateCreationInput memory input) external {
    Creation storage creation = creations[id];
    require(creation.creator != address(0), "creation not existed");
    require(creation.creator == msg.sender, "Only creator can update Creation");
    creation.name = input.name;
    creation.uri = input.uri;
    emit UpdateCreation(creation.id, creation.creator, creation.appId, input.name, input.uri);
  }

  function buy(uint256 creationId, uint256 amount) external payable nonReentrant {
    require(creationId < creationIndex, "Creation not existed");
    Creation storage creation = creations[creationId];
    (uint256 buyPriceAfterFee, uint256 buyPrice, uint256 creatorFee, uint256 appFee) = getBuyPriceAfterFee(
      creationId,
      amount,
      creation.appId
    );

    require(msg.value >= buyPriceAfterFee, "Insufficient payment");

    address farmer = farmers[creation.farmer];

    _mint(msg.sender, creationId, amount, "");
    emit Trade(TradeType.Buy, creationId, msg.sender, amount, buyPriceAfterFee, creatorFee, appFee);

    if (creation.isFarming) {
      _safeTransferETH(address(farmer), buyPrice);
      IFarmer(farmer).deposit();
    }

    ethAmount += buyPrice;
    creation.balance += buyPrice;
    creation.volume += buyPrice;

    _safeTransferETH(creation.creator, creatorFee);

    if (appFee > 0) {
      App memory app = apps[creationId];
      _safeTransferETH(app.feeTo, appFee);
    }

    uint256 refundAmount = msg.value - buyPriceAfterFee;
    if (refundAmount > 0) {
      _safeTransferETH(msg.sender, refundAmount);
    }
  }

  function sell(uint256 creationId, uint256 amount) public nonReentrant {
    require(creationId < creationIndex, "Creation not existed");
    Creation storage creation = creations[creationId];
    (uint256 sellPriceAfterFee, uint256 sellPrice, uint256 creatorFee, uint256 appFee) = getSellPriceAfterFee(
      creationId,
      amount,
      creation.appId
    );

    if (creation.isFarming) {
      address farmer = farmers[creation.farmer];
      IFarmer(farmer).withdraw(sellPrice);
    }

    ethAmount -= sellPrice;
    creation.balance -= sellPrice;
    creation.volume += sellPrice;

    _burn(msg.sender, creationId, amount);

    emit Trade(TradeType.Sell, creationId, msg.sender, amount, sellPriceAfterFee, creatorFee, appFee);

    _safeTransferETH(msg.sender, sellPriceAfterFee);
    _safeTransferETH(creation.creator, creatorFee);

    if (appFee > 0) {
      App memory app = apps[creationId];
      _safeTransferETH(app.feeTo, appFee);
    }
  }

  function getBuyPrice(uint256 creationId, uint256 amount) public view returns (uint256) {
    uint256 supply = totalSupply(creationId);
    Creation memory creation = creations[creationId];
    return ICurve(curves[creation.curve]).getPrice(supply, amount, creation.curveArgs);
  }

  function getSellPrice(uint256 creationId, uint256 amount) public view returns (uint256) {
    uint256 supply = totalSupply(creationId);
    Creation memory creation = creations[creationId];
    return ICurve(curves[creation.curve]).getPrice(supply - amount, amount, creation.curveArgs);
  }

  function getBuyPriceAfterFee(
    uint256 creationId,
    uint256 amount,
    uint256 appId
  ) public view returns (uint256 buyPriceAfterFee, uint256 buyPrice, uint256 creatorFee, uint256 appFee) {
    App memory app = apps[appId];
    buyPrice = getBuyPrice(creationId, amount);
    creatorFee = (buyPrice * app.creatorFeePercent) / 1 ether;
    appFee = (buyPrice * app.appFeePercent) / 1 ether;
    buyPriceAfterFee = buyPrice + appFee + creatorFee;
  }

  function getSellPriceAfterFee(
    uint256 creationId,
    uint256 amount,
    uint256 appId
  ) public view returns (uint256 sellPriceAfterFee, uint256 sellPrice, uint256 creatorFee, uint256 appFee) {
    App memory app = apps[appId];
    sellPrice = getSellPrice(creationId, amount);
    creatorFee = (sellPrice * app.creatorFeePercent) / 1 ether;
    appFee = (sellPrice * app.appFeePercent) / 1 ether;
    sellPriceAfterFee = sellPrice - appFee - creatorFee;
  }

  function getApp(uint256 id) public view returns (App memory) {
    return apps[id];
  }

  function getCreation(uint256 id) public view returns (Creation memory) {
    return creations[id];
  }

  function getUserCreations(address creator) public view returns (uint256[] memory) {
    return userCreations[creator];
  }

  function creationSupply(uint256 id) public view returns (uint256) {
    return totalSupply(id);
  }

  function getUserLatestCreation(address creator) public view returns (Creation memory creation) {
    uint256[] memory creationIds = userCreations[creator];

    if (creationIds.length > 0) {
      uint256 latestCreationId = creationIds[creationIds.length - 1];
      creation = creations[latestCreationId];
    }

    return creation;
  }

  function _safeTransferETH(address to, uint256 value) internal {
    (bool success, ) = to.call{ value: value }(new bytes(0));
    require(success, "ETH transfer failed");
  }

  function _update(
    address from,
    address to,
    uint256[] memory ids,
    uint256[] memory values
  ) internal override(ERC1155, ERC1155Supply) {
    super._update(from, to, ids, values);
  }
}
