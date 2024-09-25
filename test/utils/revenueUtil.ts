import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Address } from 'hardhat-deploy/types'
import { Share, Space } from 'types'

import { getTokenAmount, SECONDS_PER_MONTH } from '../utils'

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
