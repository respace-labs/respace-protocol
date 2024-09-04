import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Space } from 'types'

const planId = 0
const GAS_PRICE = 800000000n
const CREATOR_FEE_RATE = precision.token('0.006')
const PROTOCOL_FEE_RATE = precision.token('0.004')

export const SHARES_SUPPLY = 1_000_000n

export const SECONDS_PER_MONTH = BigInt(24 * 60 * 60 * 30) // 30 days
export const SECONDS_PER_DAY = BigInt(24 * 60 * 60) // 24 hours
export const SECONDS_PER_HOUR = BigInt(60 * 60) // 1 hours

export const initialX = precision.token(30)
export const initialY = precision.token(1073000191)
export const initialK = initialX * initialY

export function looseEqual(v1: bigint, v2: bigint) {
  const gap = v1 - v2
  expect(Math.abs(Number(gap))).to.lessThan(100)
}

export function mulDivDown(x: bigint, y: bigint, d: bigint) {
  return (x * y) / d
}

export function mulDivUp(x: bigint, y: bigint, d: bigint) {
  return (x * y + (d - 1n)) / d
}

export function divUp(x: bigint, y: bigint) {
  return (x + y - 1n) / y
}

export async function createSpace(f: Fixture, account: HardhatEthersSigner, name: string) {
  const tx = await f.spaceFactory.connect(account).createSpace(name, name, 0, { value: precision.token('0.01024') })
  await tx.wait()
  const info = await f.spaceFactory.getUserLatestSpace(account.address)
  const addresses = await f.spaceFactory.getUserSpaces(account.address)
  const spaceAddr = addresses[addresses.length - 1]
  const space = await getSpace(spaceAddr)

  return { spaceAddr, space, info }
}

export async function getSpace(addr: string) {
  return ethers.getContractAt('Space', addr) as any as Promise<Space>
}

export async function approve(space: Space, account: HardhatEthersSigner, value: bigint, spender = '') {
  const ethBalance0 = await ethers.provider.getBalance(account)
  const spaceAddr = await space.getAddress()
  if (!spender) {
    spender = spaceAddr
  }
  const tx = await space.connect(account).approve(spender, value, {
    gasPrice: GAS_PRICE,
  })

  const ethBalance1 = await ethers.provider.getBalance(account)
  const receipt: any = await tx.wait()
  const gasUsed = receipt.gasUsed as bigint
  const gasCost = gasUsed * GAS_PRICE

  // validate the gas used and the eth balance
  expect(ethBalance0 - ethBalance1).to.equal(gasCost)

  return { gasUsed, gasCost }
}

export async function buy(space: Space, account: HardhatEthersSigner, value: bigint) {
  const { newX, newY, tokenAmountAfterFee, creatorFee, protocolFee } = await space.getTokenAmount(value)

  const tx = await space.connect(account).buy(0n, {
    value: value,
    gasPrice: GAS_PRICE,
  })

  const receipt: any = await tx.wait()
  const gasUsed = receipt.gasUsed as bigint
  const gasCost = gasUsed * GAS_PRICE

  return { gasUsed, gasCost, newX, newY, tokenAmountAfterFee, creatorFee, protocolFee }
}

export async function sell(space: Space, account: HardhatEthersSigner, amount: bigint) {
  const { newX, newY, ethAmount, tokenAmountAfterFee, creatorFee, protocolFee } = await space.getEthAmount(amount)
  const { gasUsed: approveGasUsed } = await approve(space, account, amount)

  const tx = await space.connect(account).sell(amount, 0)

  const receipt: any = await tx.wait()
  const sellGasUsed = receipt.gasUsed as bigint
  const gasUsed = approveGasUsed + sellGasUsed
  const gasCost = gasUsed * GAS_PRICE

  return {
    gasUsed,
    gasCost,
    newX,
    newY,
    ethAmount,
    tokenAmountAfterFee,
    creatorFee,
    protocolFee,
  }
}

export async function stake(space: Space, account: HardhatEthersSigner, amount: bigint) {
  await approve(space, account, amount)
  const tx = await space.connect(account).stake(amount)
  await tx.wait()
}

export async function unstake(space: Space, account: HardhatEthersSigner, amount: bigint) {
  const tx = await space.connect(account).unstake(amount)
  await tx.wait()
}

export async function reconciliation(f: Fixture, space: Space) {
  const info = await space.getSpaceInfo()
  // expect(info.totalFee).to.be.equal()
}

export async function subscribe(space: Space, account: HardhatEthersSigner, value: bigint) {
  const spaceAddr = await space.getAddress()
  await approve(space, account, value)
  const tx = await space.connect(account).subscribe(planId, value)
  await tx.wait()
}

export async function unsubscribe(space: Space, account: HardhatEthersSigner, amount: bigint) {
  const tx = await space.connect(account).unsubscribe(planId, amount)
  await tx.wait()
}

export async function distributeSingleSubscription(space: Space, account: HardhatEthersSigner) {
  const tx = await space.distributeSingleSubscription(0, account.address)
  await tx.wait()
}

export async function distributeSubscriptionRewards(space: Space) {
  const tx = await space.distributeSubscriptionRewards()
  await tx.wait()
}

export async function distributeStakingRewards(space: Space) {
  const tx = await space.distributeStakingRewards()
  await tx.wait()
}

export async function claimStakingRewards(space: Space, account: HardhatEthersSigner) {
  const tx = await space.connect(account).claimStakingRewards()
  await tx.wait()
}

export async function claimShareRewards(space: Space, account: HardhatEthersSigner) {
  const tx = await space.connect(account).claimShareRewards()
  await tx.wait()
}

export function getTokenAmount(x: bigint, y: bigint, k: bigint, ethAmount: bigint) {
  const newX = x + ethAmount
  const newY = divUp(k, newX)
  const tokenAmount = y - newY
  const creatorFee = (tokenAmount * CREATOR_FEE_RATE) / precision.token(1)
  const protocolFee = (tokenAmount * PROTOCOL_FEE_RATE) / precision.token(1)
  const tokenAmountAfterFee = tokenAmount - protocolFee - creatorFee
  return {
    tokenAmount,
    tokenAmountAfterFee,
    protocolFee,
    creatorFee,
  }
}

export function getEthAmount(x: bigint, y: bigint, k: bigint, tokenAmount: bigint) {
  const creatorFee = (tokenAmount * CREATOR_FEE_RATE) / precision.token(1)
  const protocolFee = (tokenAmount * PROTOCOL_FEE_RATE) / precision.token(1)
  const tokenAmountAfterFee = tokenAmount - creatorFee - protocolFee

  const newY = y + tokenAmountAfterFee
  const newX = divUp(k, newY)
  const ethAmount = x - newX
  return {
    creatorFee,
    protocolFee,
    tokenAmountAfterFee,
    ethAmount,
  }
}

export function getTokenPricePerSecond(x: bigint, y: bigint, k: bigint) {
  const monthlyPrice = precision.token('0.002048')
  const SECONDS_PER_MONTH = BigInt(24 * 60 * 60 * 30) // 30 days
  const ethPricePerSecond = monthlyPrice / SECONDS_PER_MONTH
  const { tokenAmountAfterFee } = getTokenAmount(x, y, k, ethPricePerSecond)
  return tokenAmountAfterFee
}

export async function executeShareOrder(space: Space, account: HardhatEthersSigner, orderId: bigint, amount: bigint) {
  const sharePrice = precision.token('0.005')

  const tx = await space
    .connect(account)
    .executeShareOrder(orderId, amount, { value: sharePrice * amount, gasPrice: GAS_PRICE })

  const receipt: any = await tx.wait()
  const gasUsed = receipt.gasUsed as bigint
  const gasCost = gasUsed * GAS_PRICE

  return { gasUsed, gasCost }
}

export async function transferShares(
  space: Space,
  account: HardhatEthersSigner,
  to: HardhatEthersSigner,
  amount: bigint,
) {
  const tx = await space.connect(account).transferShares(to.address, amount, { gasPrice: GAS_PRICE })
  const receipt: any = await tx.wait()
  const gasUsed = receipt.gasUsed as bigint
  const gasCost = gasUsed * GAS_PRICE

  return { gasUsed, gasCost }
}
