// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

library Errors {
  /** common */
  error AmountIsZero();
  error AmountTooLarge();
  error PriceIsZero();
  error EthAmountIsZero();
  error InsufficientPayment();
  error OnlyCreator();
  error InvalidAddress();

  /** CreationFactory */
  error URIIsEmpty();
  error CreationNotFound();
  error InvalidFeePercent();

  /** SpaceFactory */
  error InvalidAppId();
  error AppNotFound();
  error InvalidFeeReceiver();
  // appFeePercent must be <= 20%
  error ExceedMaxAppFeePercent();
  error InvalidTokens();

  /** Space */
  error OnlyFactory();
  error TokenAmountTooLarge();
  // Staking revenue percent must be >= 10% And <= 100%
  error InvalidStakingRevenuePercent();

  /** Token */
  error SlippageTooHigh();

  /** Member */
  error PlanNotExisted();
  error PlanNotActive();
  error SubscribeAmountTooSmall();
  error ContributorExisted();

  /** Share */
  error OnlyContributor();
  error InsufficientShares();
  error InvalidRecipient();
  error OrderNotFound();
  error OnlySeller();
  error OnlyPayer();
  error ExceedOrderAmount();
  error InvalidBeneficiary();
  error BeneficiaryExists();
  error BeneficiaryNotFound();
  error AllocationTooLarge();

  /** curation */
  error CodeIsEmpty();
  error CodeAlreadyExists();
  error ShouldCreateCodeFirstly();
  error CodeIsUsed();
  error CodeNotExists();
  error CannotInviteYourself();
  error UserIsInvited();
  error SubscriptionNotFound();
}
