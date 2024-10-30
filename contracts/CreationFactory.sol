// SPDX-License-Identifier: MIT

pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./lib/TransferUtil.sol";
import "./lib/Errors.sol";
import "./interfaces/ICreationFactory.sol";

contract CreationFactory is ICreationFactory, Ownable, ERC1155, ERC1155Supply, ReentrancyGuard {
  uint256 public creatorFeePercent = 0.5 ether; // 50%
  uint256 public curatorFeePercent = 0.25 ether; // 25%
  uint256 public protocolFeePercent = 0.25 ether; // 25%

  uint256 public creationIndex;
  uint256 public ethAmount;
  address public protocolFeeTo;

  mapping(uint256 => Creation) public creations;
  mapping(address => uint256[]) public userCreations;
  mapping(bytes32 id => bool) public minted;

  event Created(uint256 creationId, address indexed creator, string uri, uint256 price);
  event Minted(uint256 indexed creationId, address indexed minter, address curator, uint256 amount, string mark);
  event CreationUpdated(uint256 indexed creationId, address indexed creator, string uri, uint256 price);
  event ProtocolFeeToUpdated(address indexed previousFeeTo, address indexed newFeeTo);
  event FeePercentUpdated(uint256 creatorFeePercent, uint256 curatorFeePercent, uint256 protocolFeePercent);

  constructor(address initialOwner) ERC1155("") Ownable(initialOwner) {
    protocolFeeTo = initialOwner;
  }

  fallback() external payable {}

  receive() external payable {}

  function create(address creator, string calldata uri, uint256 price) public returns (uint256 creationId) {
    if (price == 0) revert Errors.PriceIsZero();
    if (bytes(uri).length == 0) revert Errors.URIIsEmpty();
    creationId = creationIndex;
    creations[creationId] = Creation(creationId, creator, uri, price);
    userCreations[creator].push(creationId);
    creationIndex++;
    emit Created(creationId, creator, uri, price);
  }

  function mint(
    uint256 creationId,
    uint32 amount,
    address curator,
    string calldata mark
  ) public payable nonReentrant returns (uint256 creatorFee, uint256 protocolFee, uint256 curatorFee) {
    if (amount == 0) revert Errors.AmountIsZero();
    if (creationId >= creationIndex) revert Errors.CreationNotFound();
    Creation memory creation = creations[creationId];
    uint256 mintFee = creation.price * amount;
    if (msg.value < mintFee) revert Errors.InsufficientPayment();

    bool isValidCurator = curator != address(0) && minted[keccak256(abi.encode(creationId, curator))];

    protocolFee = (mintFee * protocolFeePercent) / 1 ether;
    curatorFee = isValidCurator ? (mintFee * curatorFeePercent) / 1 ether : 0;
    creatorFee = mintFee - protocolFee - curatorFee;

    bytes32 mintedId = keccak256(abi.encode(creationId, msg.sender));
    if (!minted[mintedId]) minted[mintedId] = true;

    TransferUtil.safeTransferETH(creation.creator, creatorFee);
    TransferUtil.safeTransferETH(protocolFeeTo, protocolFee);

    if (curatorFee > 0) {
      TransferUtil.safeTransferETH(curator, curatorFee);
    }

    ethAmount += mintFee;
    _mint(msg.sender, creationId, amount, "");

    uint256 refundAmount = msg.value - mintFee;
    if (refundAmount > 0) {
      TransferUtil.safeTransferETH(msg.sender, refundAmount);
    }

    emit Minted(creationId, msg.sender, curator, amount, mark);
  }

  function createAndMint(
    address creator,
    string calldata uri,
    uint256 price,
    uint32 amount,
    string calldata mark
  ) external payable returns (uint256 creationId) {
    creationId = create(creator, uri, price);
    mint(creationId, amount, address(0), mark);
  }

  function updateCreation(uint256 id, string calldata uri, uint256 price) external {
    Creation storage creation = creations[id];
    if (creation.creator == address(0)) revert Errors.CreationNotFound();
    if (creation.creator != msg.sender) revert Errors.OnlyCreator();
    creation.uri = uri;
    creation.price = price;
    emit CreationUpdated(creation.id, creation.creator, uri, price);
  }

  function setProtocolFeeTo(address _feeTo) external onlyOwner {
    protocolFeeTo = _feeTo;
    emit ProtocolFeeToUpdated(protocolFeeTo, _feeTo);
  }

  function setFeePercent(
    uint256 _creatorFeePercent,
    uint256 _curatorFeePercent,
    uint256 _protocolFeePercent
  ) external onlyOwner {
    if (_creatorFeePercent + _curatorFeePercent + _protocolFeePercent != 1 ether) {
      revert Errors.InvalidFeePercent();
    }

    creatorFeePercent = _creatorFeePercent;
    curatorFeePercent = _curatorFeePercent;
    protocolFeePercent = _protocolFeePercent;

    emit FeePercentUpdated(creatorFeePercent, curatorFeePercent, protocolFeePercent);
  }

  function getUserCreations(address creator) external view returns (uint256[] memory) {
    return userCreations[creator];
  }

  function creationSupply(uint256 id) external view returns (uint256) {
    return totalSupply(id);
  }

  function getUserLatestCreation(address creator) external view returns (Creation memory creation) {
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
