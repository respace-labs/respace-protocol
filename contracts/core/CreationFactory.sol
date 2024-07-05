// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./CreationERC20.sol";

contract CreationFactory is Ownable {
  using SafeERC20 for IERC20;

  struct Curve {
    uint96 basePrice;
    uint128 linearPriceSlope;
    uint32 inflectionPoint;
    uint128 inflectionPrice;
    bool exists;
  }

  struct Creation {
    address id;
    uint8 curveType;
    address creator;
    string symbol;
  }

  mapping(uint8 curveType => Curve curve) public curves;
  mapping(address id => Creation creation) public creations;
  mapping(address account => address[]) public userCreations;
  mapping(bytes32 => address id) public symbolToCreationId;

  uint256 public shareIndex;
  uint256 public depositedETHAmount;
  uint256 public referralFeePercent = 2 * 1e16;
  uint256 public creatorFeePercent = 5 * 1e16;
  uint256 public migrationDeadline;

  event Create(address indexed creationId, address indexed creator, uint8 curveType);

  constructor(
    address initialOwner,
    uint96 _basePrice,
    uint32 _inflectionPoint,
    uint128 _inflectionPrice,
    uint128 _linearPriceSlope
  ) Ownable(initialOwner) {
    // Set default curve params
    curves[0] = Curve({
      basePrice: _basePrice, // 0.001 ether;
      inflectionPoint: _inflectionPoint, // 1000;
      inflectionPrice: _inflectionPrice, // 0.1 ether;
      linearPriceSlope: _linearPriceSlope, // 0;
      exists: true
    });
  }

  function create(string memory symbol, uint8 curveType) public {
    address creator = msg.sender;
    CreationERC20 creationContract = new CreationERC20(address(this), symbol, msg.sender, 0);

    address creationId = address(creationContract);
    bytes32 symbolHash = keccak256(abi.encodePacked(symbol));

    creations[creationId] = Creation(creationId, curveType, creator, symbol);
    userCreations[creator].push(creationId);
    symbolToCreationId[symbolHash] = creationId;

    emit Create(creationId, creator, curveType);
  }

  function buy(address creationId, uint256 amount) public payable {
    CreationERC20(creationId).mint(msg.sender, amount);
  }

  function sell(address creation, uint256 amount) public payable {
    CreationERC20(creation).burn(msg.sender, amount);
  }

  function _curve(uint256 x) private pure returns (uint256) {
    return x * x * x;
  }

  function getPrice(uint256 supply, uint256 amount) public pure returns (uint256) {
    return (_curve(supply + amount) - _curve(supply)) / 1 ether / 1 ether / 50_000;
  }

  function getBuyPrice(address creation, uint256 amount) public view returns (uint256) {
    uint256 totalSupply = IERC20(creation).totalSupply();
    return getPrice(totalSupply, amount);
  }

  function getSellPrice(address creation, uint256 amount) public view returns (uint256) {
    uint256 totalSupply = IERC20(creation).totalSupply();
    return getPrice(totalSupply - amount, amount);
  }

  function getBuyPriceAfterFee(
    address creationId,
    uint32 quantity,
    address referral
  ) public view returns (uint256 buyPriceAfterFee, uint256 buyPrice, uint256 referralFee, uint256 creatorFee) {}

  function getCurve(uint8 curveType) public view returns (uint96, uint32, uint128, uint128, bool) {
    require(curves[curveType].exists, "Invalid curveType");
    Curve memory curve = curves[curveType];
    return (curve.basePrice, curve.inflectionPoint, curve.inflectionPrice, curve.linearPriceSlope, curve.exists);
  }

  function getUserCreations(address creator) public view returns (address[] memory) {
    return userCreations[creator];
  }

  function getUserCreationBySymbol(
    address creator,
    string memory symbol
  ) public view returns (Creation memory creation) {
    address[] memory creationIds = userCreations[creator];
    for (uint8 i; i < creationIds.length; i++) {
      string memory creationSymbol = creations[creationIds[i]].symbol;

      if (keccak256(abi.encodePacked(creationSymbol)) == keccak256(abi.encodePacked(symbol))) {
        return creations[creationIds[i]];
      }
    }

    return creation;
  }
}
