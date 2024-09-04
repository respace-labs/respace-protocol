// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./lib/TransferUtil.sol";

contract CreationFactory is Ownable, ERC1155, ERC1155Supply, ReentrancyGuard {
  uint256 public creatorFeePercent = 0.5 ether; // 50%
  uint256 public curatorFeePercent = 0.25 ether; // 25%
  uint256 public protocolFeePercent = 0.25 ether; // 25%

  uint256 public mintPrice = 0.0001024 ether;
  uint256 public creationIndex;
  uint256 public ethAmount;
  address public protocolFeeTo;

  mapping(uint256 => Creation) public creations;
  mapping(address => uint256[]) public userCreations;

  struct Creation {
    uint256 id;
    address creator;
    uint8 creationType;
    uint8 priceMultiple;
    string uri;
  }

  event NewCreation(
    uint256 creationId,
    address indexed creator,
    uint8 indexed creationType,
    uint8 priceMultiple,
    string uri
  );

  event UpdateURI(uint256 indexed creationId, address indexed creator, string uri);

  event Mint(
    uint256 indexed creationId,
    address indexed creator,
    address curator,
    uint256 amount,
    uint256 ethAmount,
    uint256 creatorFee,
    uint256 curatorFee,
    uint256 protocolFee
  );

  event ProtocolFeeToUpdated(address indexed previousFeeTo, address indexed newFeeTo);
  event FeePercentUpdated(uint256 creatorFeePercent, uint256 curatorFeePercent, uint256 protocolFeePercent);

  constructor(address initialOwner) ERC1155("") Ownable(initialOwner) {}

  fallback() external payable {}

  receive() external payable {}

  function setProtocolFeeTo(address _feeTo) public onlyOwner {
    protocolFeeTo = _feeTo;
    emit ProtocolFeeToUpdated(protocolFeeTo, _feeTo);
  }

  function setFeePercent(
    uint256 _creatorFeePercent,
    uint256 _curatorFeePercent,
    uint256 _protocolFeePercent
  ) public onlyOwner {
    require(_creatorFeePercent + _curatorFeePercent + _protocolFeePercent == 1 ether, "Invalid fee percent");
    creatorFeePercent = _creatorFeePercent;
    curatorFeePercent = _curatorFeePercent;
    protocolFeePercent = _protocolFeePercent;

    emit FeePercentUpdated(creatorFeePercent, curatorFeePercent, protocolFeePercent);
  }

  function create(uint8 creationType, uint8 priceMultiple, string calldata uri) public returns (uint256 creationId) {
    require(bytes(uri).length > 0, "URI cannot be empty");
    address creator = msg.sender;
    creationId = creationIndex;
    creations[creationId] = Creation(creationId, creator, creationType, priceMultiple, uri);
    userCreations[creator].push(creationId);
    creationIndex++;
    emit NewCreation(creationId, creator, creationType, priceMultiple, uri);
  }

  function updateURI(uint256 id, string calldata uri) external {
    Creation storage creation = creations[id];
    require(creation.creator != address(0), "Creation not existed");
    require(creation.creator == msg.sender, "Only creator can update Creation");
    creation.uri = uri;
    emit UpdateURI(creation.id, creation.creator, uri);
  }

  function mint(uint256 creationId, uint32 amount, address curator) external payable nonReentrant {
    require(amount > 0, "Buy amount cannot be zero");
    require(creationId < creationIndex, "Creation not found");
    Creation memory creation = creations[creationId];
    uint256 mintFee = mintPrice * creation.priceMultiple * amount;
    require(msg.value >= mintFee, "Insufficient payment");

    bool hasCurator = curator != address(0);
    uint256 protocolFee = (mintFee * protocolFeePercent) / 1 ether;
    uint256 curatorFee = hasCurator ? (mintFee * curatorFeePercent) / 1 ether : 0;
    uint256 creatorFee = mintFee - protocolFee - curatorFee;

    TransferUtil.safeTransferETH(creation.creator, creatorFee);
    TransferUtil.safeTransferETH(protocolFeeTo, protocolFee);

    if (curatorFee > 0) {
      TransferUtil.safeTransferETH(curator, curatorFee);
    }

    ethAmount += mintFee;
    _mint(msg.sender, creationId, amount, "");

    emit Mint(creationId, msg.sender, curator, amount, msg.value, creatorFee, curatorFee, protocolFee);
  }

  function getCreation(uint256 id) external view returns (Creation memory) {
    return creations[id];
  }

  function getUserCreations(address creator) external view returns (uint256[] memory) {
    return userCreations[creator];
  }

  function creationSupply(uint256 id) external view returns (uint256) {
    return totalSupply(id);
  }

  function getUserLatestCreation(address creator) public view returns (Creation memory creation) {
    uint256[] memory creationIds = userCreations[creator];
    if (creationIds.length > 0) {
      creation = creations[creationIds[creationIds.length - 1]];
    }
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
