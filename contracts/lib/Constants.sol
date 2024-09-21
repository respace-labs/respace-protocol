// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// 30 days
uint256 constant SECONDS_PER_MONTH = 24 * 60 * 60 * 30;

uint256 constant DEFAULT_SUBSCRIPTION_PRICE = 0.002048 * 1 ether;

uint256 constant DEFAULT_MIN_SUBSCRIPTION_AMOUNT = 0 * 1 ether;

uint256 constant PER_SHARE_PRECISION = 10 ** 18;

uint256 constant SHARES_SUPPLY = 1_000_000;

uint256 constant PER_TOKEN_PRECISION = 10 ** 26;

// two years
uint256 constant YIELD_DURATION = 24 * 60 * 60 * 365 * 2;

uint256 constant PREMINT_ETH_AMOUNT = 3.3333 ether;
