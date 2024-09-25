import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Address } from 'hardhat-deploy/types'
import { Share, Space } from 'types'

import {
  SECONDS_PER_MONTH,
  approve,
  getEthAmountForTokenPurchase,
  getTokenAmount,
  getPlanTokenPricePerSecond,
  getEthAmountWithoutFee,
  getSpaceInfo,
} from '../utils'

import { CREATOR_FEE_PERCENT, PROTOCOL_FEE_PERCENT } from './revenueUtil'

export function getTokenPricePerSecondWithMonthlyPrice(x: bigint, y: bigint, k: bigint, monthlyPrice: bigint) {
  const ethPricePerSecond = monthlyPrice / SECONDS_PER_MONTH
  const { tokenAmountAfterFee } = getTokenAmount(x, y, k, ethPricePerSecond)
  return tokenAmountAfterFee
}

export async function subscribeForMonths(space: Space, account: HardhatEthersSigner, months: number, planId: number) {
  const tokenAmountAfterFee = await getPlanTokenPricePerSecond(space, planId)
  const totalTokenAmount = tokenAmountAfterFee * BigInt(months) * SECONDS_PER_MONTH
  await approve(space, account, totalTokenAmount)
  const tx = await space.connect(account).subscribe(planId, totalTokenAmount)
  await tx.wait()
}

export async function calculateSubscribeEthAmountForMonths(
  space: Space,
  planId: number,
  months: number,
): Promise<bigint> {
  const tokenAmountAfterFee = await getPlanTokenPricePerSecond(space, planId)
  const totalTokenAmount = tokenAmountAfterFee * BigInt(months) * SECONDS_PER_MONTH
  const { x, y, k } = await getSpaceInfo(space)
  return getEthAmountForTokenPurchase(x, y, k, totalTokenAmount, CREATOR_FEE_PERCENT, PROTOCOL_FEE_PERCENT)
}
