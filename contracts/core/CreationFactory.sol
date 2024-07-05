// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./CreationERC20.sol";
import "../interfaces/ICurve.sol";
import "../interfaces/IFarmer.sol";

contract CreationFactory is Ownable {
  using SafeERC20 for IERC20;

  struct Creation {
    address id;
    address creator;
    uint8 curve;
    uint8 farmer;
    string symbol;
  }

  mapping(uint8 curveType => address curve) public curves;
  mapping(uint8 farmerType => address farmer) public farmers;
  mapping(address creationId => Creation creation) public creations;
  mapping(address account => address[] creationId) public userCreations;

  uint8 public curveIndex = 0;
  uint8 public farmerIndex = 0;
  uint256 public depositedETHAmount;
  uint256 public referralFeePercent = 2 * 1e16;
  uint256 public creatorFeePercent = 5 * 1e16;
  uint256 public migrationDeadline;

  event Create(address indexed creationId, address indexed creator, uint8 curveType, uint8 farmerType);
  event Buy(address indexed creationId, address indexed buyer, uint256 amount, uint256 totalPrice);
  event Sell(address indexed creationId, address indexed seller, uint256 amount, uint256 totalPrice);

  constructor(address initialOwner) Ownable(initialOwner) {}

  function addCurve(address curve) external {
    curves[curveIndex] = curve;
    curveIndex++;
  }

  function addFarmer(address farmer) external {
    farmers[farmerIndex] = farmer;
    farmerIndex++;
  }

  function create(string memory symbol, uint initialSupply, uint8 curveType, uint8 farmerType) public {
    address creator = msg.sender;
    CreationERC20 creationContract = new CreationERC20(address(this), symbol, msg.sender, initialSupply);

    address creationId = address(creationContract);
    creations[creationId] = Creation(creationId, creator, curveType, farmerType, symbol);
    userCreations[creator].push(creationId);

    emit Create(creationId, creator, curveType, farmerType);
  }

  function buy(address creationId, uint256 amount) public payable {
    Creation memory creation = creations[creationId];
    console.log("creation.id====:", creation.id);
    require(creation.id != address(0), "Creation does not exist");
    uint256 price = getBuyPrice(creationId, amount);

    require(msg.value >= price, "Insufficient payment");

    address farmer = farmers[creation.farmer];
    console.log("====farmer:", farmer);
    console.log("====value:", msg.value, price);
    _safeTransferETH(address(farmer), price);
    IFarmer(farmer).deposit();

    CreationERC20(creationId).mint(msg.sender, amount);
    emit Buy(creationId, msg.sender, amount, price);
  }

  function sell(address creation, uint256 amount) public {
    CreationERC20(creation).burn(msg.sender, amount);
  }

  function getBuyPrice(address creationId, uint256 amount) public view returns (uint256) {
    uint256 totalSupply = IERC20(creationId).totalSupply();
    Creation memory creation = creations[creationId];

    return ICurve(curves[creation.curve]).getPrice(totalSupply, amount);
  }

  function getSellPrice(address creationId, uint256 amount) public view returns (uint256) {
    uint256 totalSupply = IERC20(creationId).totalSupply();
    Creation memory creation = creations[creationId];
    return ICurve(curves[creation.curve]).getPrice(totalSupply - amount, amount);
  }

  function getBuyPriceAfterFee(
    address creationId,
    uint32 amount,
    address referral
  ) public view returns (uint256 buyPriceAfterFee, uint256 buyPrice, uint256 referralFee, uint256 creatorFee) {}

  function getUserCreations(address creator) public view returns (address[] memory) {
    return userCreations[creator];
  }

  function getUserLatestCreation(address creator) public view returns (Creation memory creation) {
    address[] memory creationIds = userCreations[creator];

    if (creationIds.length > 0) {
      address latestCreationId = creationIds[creationIds.length - 1];
      creation = creations[latestCreationId];
    }

    return creation;
  }

  function _safeTransferETH(address to, uint256 value) internal {
    (bool success, ) = to.call{ value: value }(new bytes(0));
    require(success, "ETH transfer failed");
  }
}
