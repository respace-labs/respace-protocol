import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Space } from 'types'

import { SECONDS_PER_MONTH, approve, getTokenAmount, getPlanTokenPricePerSecond } from '../utils'

export function getTokenPricePerSecondWithMonthlyPrice(x: bigint, y: bigint, k: bigint, monthlyPrice: bigint) {
  const ethPricePerSecond = monthlyPrice / SECONDS_PER_MONTH
  const { tokenAmountAfterFee } = getTokenAmount(x, y, k, ethPricePerSecond)
  return tokenAmountAfterFee
}

export async function subscribeForMonths(space: Space, account: HardhatEthersSigner, months: number, planId: number) {
  const tokenAmountAfterFee = await getPlanTokenPricePerSecond(space, planId)
  const totalTokenAmount = tokenAmountAfterFee * BigInt(months) * SECONDS_PER_MONTH
  await approve(space, account, totalTokenAmount)
  const tx = await space.connect(account).subscribe(planId, totalTokenAmount, '')
  await tx.wait()
}
