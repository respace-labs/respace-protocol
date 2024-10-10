import { precision } from '@utils/precision'

// token buy and sell fees
export const CREATOR_FEE_PERCENT = precision.token('0.06')
export const PROTOCOL_FEE_PERCENT = precision.token('0.04')
// subscription fees
export const PROTOCOL_SUBSCRIPTION_FEE_PERCENT = precision.token('0.02')
// creator revenue share
export const REVENUE_TO_STAKING_PERCENT = precision.token('0.3')

//
export function distributeCreatorRevenue(creatorRevenue: bigint, stakingAmount: bigint) {
  if (stakingAmount == precision.token(0)) {
    return { stakingRevenue: precision.token(0), daoRevenue: creatorRevenue }
  }
  const stakingRevenue = (creatorRevenue * REVENUE_TO_STAKING_PERCENT) / precision.token(1)
  const daoRevenue = creatorRevenue - stakingRevenue
  return { stakingRevenue, daoRevenue }
}
