// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SafeCastLib } from "solady/src/utils/SafeCastLib.sol";

import "../interfaces/IFarmer.sol";
import { BondingCurveLib } from "../lib/BondingCurveLib.sol";

import "hardhat/console.sol";

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

  IERC20 usdc;

  uint8 public farmerIndex = 0;
  uint256 public appIndex = 0;
  uint256 public creationIndex = 0;
  uint256 usdcAmount = 0;
  uint256 public constant CREATOR_PREMINT = 1;
  uint256 public protocolFeePercent = 0.01 ether;
  address public protocolFeeTo;

  mapping(uint8 => address) public farmers;
  mapping(uint256 => App) public apps;
  mapping(uint256 => Creation) public creations;
  mapping(address => uint256[]) public userCreations;

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

  constructor(address initialOwner) ERC1155("") Ownable(initialOwner) {}

  fallback() external payable {}

  receive() external payable {}

  function setProtocolFeeTo(address _feeTo) public onlyOwner {
    emit ProtocolFeeToUpdated(protocolFeeTo, _feeTo);
    protocolFeeTo = _feeTo;
  }

  function setProtocolFeePercent(uint256 _feePercent) public onlyOwner {
    // never > 1%, make it 0% in future
    require(_feePercent <= 0.01 ether, "protocolFeePercent must be <= 1%");
    emit ProtocolFeePercentUpdated(protocolFeePercent, _feePercent);
    protocolFeePercent = _feePercent;
  }

  function setUSDC(address _usdc) external onlyOwner {
    usdc = IERC20(_usdc);
  }

  function addFarmer(address farmer) external onlyOwner {
    farmers[farmerIndex] = farmer;
    emit FarmerAdded(farmerIndex, farmer);
    farmerIndex++;
  }

  function newApp(UpsertAppInput memory input) external {
    require(bytes(input.name).length > 0, "Name cannot be empty");
    require(input.feeTo != address(0), "Invalid feeTo address");
    require(input.appFeePercent <= 0.1 ether, "appFeePercent must be <= 10%");
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
    require(bytes(input.name).length > 0, "Name cannot be empty");
    require(input.feeTo != address(0), "Invalid feeTo address");
    require(input.appFeePercent <= 0.1 ether, "appFeePercent must be <= 10%");

    app.name = input.name;
    app.uri = input.uri;
    app.feeTo = input.feeTo;
    app.appFeePercent = input.appFeePercent;
    app.creatorFeePercent = input.creatorFeePercent;
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

  function newCreation(NewCreationInput memory input) external returns (uint256 creationId) {
    require(bytes(input.name).length > 0, "Name cannot be empty");
    console.log("=======msg.sender:", msg.sender);
    address creator = msg.sender;
    creationId = creationIndex;
    creations[creationId] = Creation(
      creationId,
      input.appId,
      creator,
      input.name,
      input.uri,
      input.curatorFeePercent,
      input.curve,
      input.farmer,
      input.isFarming,
      0,
      0
    );
    userCreations[creator].push(creationId);
    _mint(creator, creationId, CREATOR_PREMINT, "");
    emit NewCreation(
      creationId,
      creator,
      input.appId,
      input.name,
      input.uri,
      input.curve,
      input.farmer,
      input.isFarming
    );

    creationIndex++;
  }

  function updateCreation(uint256 id, UpdateCreationInput memory input) external {
    Creation storage creation = creations[id];
    require(creation.creator != address(0), "Creation not existed");
    require(creation.creator == msg.sender, "Only creator can update Creation");
    require(bytes(input.name).length > 0, "Name cannot be empty");
    creation.name = input.name;
    creation.uri = input.uri;
    creation.curatorFeePercent = input.curatorFeePercent;
    emit UpdateCreation(creation.id, creation.creator, creation.appId, input.name, input.uri);
  }

  function buy(uint256 creationId, uint32 amount, address curator) external payable nonReentrant {
    require(amount > 0, "Buy amount cannot be zero");
    require(creationId < creationIndex, "Creation does not exist");
    Creation storage creation = creations[creationId];
    PriceInfo memory info = getBuyPriceAfterFee(creationId, amount, creation.appId);

    bool success = usdc.transferFrom(msg.sender, address(this), info.priceAfterFee);
    require(success, "USDC transfer from failed");

    usdcAmount += info.price;
    creation.balance += info.price;
    creation.volume += info.price;
    _mint(msg.sender, creationId, amount, "");

    if (creation.isFarming) {
      address farmer = farmers[creation.farmer];
      transferUSDC(address(farmer), info.price);
      IFarmer(farmer).deposit();
    }

    uint256 curatorFee = 0;
    if (curator != address(0)) {
      curatorFee = (info.creatorFee * creation.curatorFeePercent) / 1 ether;
      transferUSDC(creation.creator, info.creatorFee - curatorFee);
      transferUSDC(curator, curatorFee);
    } else {
      transferUSDC(creation.creator, info.creatorFee);
    }

    if (info.appFee > 0) {
      App memory app = apps[creation.appId];
      transferUSDC(app.feeTo, info.appFee);
    }

    if (info.protocolFee > 0) {
      transferUSDC(protocolFeeTo, info.protocolFee);
    }

    emit Trade(
      TradeType.Buy,
      creationId,
      msg.sender,
      amount,
      info.priceAfterFee,
      info.creatorFee,
      info.appFee,
      info.protocolFee,
      curator,
      curatorFee
    );
  }

  function sell(uint256 creationId, uint32 amount) external nonReentrant {
    require(creationId < creationIndex, "Creation not existed");
    require(balanceOf(msg.sender, creationId) >= amount, "Insufficient amount");
    require(totalSupply(creationId) - CREATOR_PREMINT >= amount, "Amount should below premint amount");
    Creation storage creation = creations[creationId];
    PriceInfo memory info = getSellPriceAfterFee(creationId, amount, creation.appId);

    usdcAmount -= info.price;
    creation.balance -= info.price;
    creation.volume += info.price;

    _burn(msg.sender, creationId, amount);

    if (creation.isFarming) {
      address farmer = farmers[creation.farmer];
      IFarmer(farmer).withdraw(address(usdc), info.price);
    }

    transferUSDC(msg.sender, info.priceAfterFee);
    transferUSDC(creation.creator, info.creatorFee);

    if (info.appFee > 0) {
      App memory app = apps[creation.appId];
      transferUSDC(app.feeTo, info.appFee);
    }

    if (info.protocolFee > 0) {
      transferUSDC(protocolFeeTo, info.protocolFee);
    }

    emit Trade(
      TradeType.Sell,
      creationId,
      msg.sender,
      amount,
      info.priceAfterFee,
      info.creatorFee,
      info.appFee,
      info.protocolFee,
      address(0),
      0
    );
  }

  function getBuyPrice(uint256 creationId, uint32 amount) public view returns (uint256) {
    return _getPrice(creationId, amount, true);
  }

  function getSellPrice(uint256 creationId, uint32 amount) public view returns (uint256) {
    return _getPrice(creationId, amount, false);
  }

  function getBuyPriceAfterFee(
    uint256 creationId,
    uint32 amount,
    uint256 appId
  ) public view returns (PriceInfo memory) {
    return _getPriceAfterFee(creationId, amount, appId, true);
  }

  function getSellPriceAfterFee(
    uint256 creationId,
    uint32 amount,
    uint256 appId
  ) public view returns (PriceInfo memory) {
    return _getPriceAfterFee(creationId, amount, appId, false);
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
      creation = creations[creationIds[creationIds.length - 1]];
    }
  }

  function _getPriceAfterFee(
    uint256 creationId,
    uint32 amount,
    uint256 appId,
    bool isBuy
  ) internal view returns (PriceInfo memory) {
    App memory app = apps[appId];

    uint256 price = isBuy ? getBuyPrice(creationId, amount) : getSellPrice(creationId, amount);
    uint256 creatorFee = (price * app.creatorFeePercent) / 1 ether;
    uint256 protocolFee = (price * protocolFeePercent) / 1 ether;
    uint256 appFee = (price * app.appFeePercent) / 1 ether;
    uint256 priceAfterFee = isBuy
      ? price + creatorFee + appFee + protocolFee
      : price - creatorFee - appFee - protocolFee;
    return PriceInfo(priceAfterFee, price, creatorFee, appFee, protocolFee);
  }

  function _getPrice(uint256 creationId, uint32 amount, bool isBuy) internal view returns (uint256) {
    uint256 supply = totalSupply(creationId);
    Creation memory creation = creations[creationId];
    uint256 newSupply = isBuy ? supply : supply - amount;

    return getSubTotal(creation, SafeCastLib.toUint32(newSupply), amount);
  }

  function getSubTotal(Creation memory creation, uint32 fromSupply, uint32 quantity) public pure returns (uint256) {
    Curve memory curve = creation.curve;

    return
      _subTotal(
        fromSupply,
        quantity,
        curve.basePrice,
        curve.inflectionPoint,
        curve.inflectionPrice,
        curve.linearPriceSlope
      );
  }

  function _subTotal(
    uint32 fromSupply,
    uint32 quantity,
    uint96 basePrice,
    uint32 inflectionPoint,
    uint128 inflectionPrice,
    uint128 linearPriceSlope
  ) internal pure returns (uint256 subTotal) {
    unchecked {
      subTotal = basePrice * quantity;
      subTotal += BondingCurveLib.linearSum(linearPriceSlope, fromSupply, quantity);
      subTotal += BondingCurveLib.sigmoid2Sum(inflectionPoint, inflectionPrice, fromSupply, quantity);
    }
  }

  function transferUSDC(address to, uint256 value) internal {
    bool success = usdc.transfer(to, value);
    require(success, "USDC transfer failed");
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
