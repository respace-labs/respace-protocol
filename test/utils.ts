import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Address } from 'hardhat-deploy/types'
import { bigint } from 'hardhat/internal/core/params/argumentTypes'
import { Share, Space } from 'types'

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

export type SpaceInfo = {
  founder: Address
  totalFee: bigint
  // token
  x: bigint
  y: bigint
  k: bigint

  // share
  daoFee: bigint
  accumulatedRewardsPerShare: bigint
  orderIndex: bigint
  // member
  planIndex: bigint
  subscriptionIndex: bigint
  subscriptionIncome: bigint
  // staking
  yieldStartTime: bigint
  yieldAmount: bigint
  yieldReleased: bigint
  stakingFee: bigint
  totalStaked: bigint
  accumulatedRewardsPerToken: bigint
}

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
  const tx = await f.spaceFactory.connect(account).createSpace(0, name, name, 0, { value: precision.token('0.01024') })
  await tx.wait()
  const addresses = await f.spaceFactory.getUserSpaces(account.address)
  const spaceAddr = addresses[addresses.length - 1]
  const space = await getSpace(spaceAddr)
  const info = await getSpaceInfo(space)
  const { newX, newY, newK, tokenAmount } = getTokenAmount(initialX, initialY, initialK, precision.token(30))

  return { spaceAddr, space, premint: tokenAmount, info }
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
  const { x, y, k } = await space.token()
  const { newX, newY, tokenAmountAfterFee, creatorFee, protocolFee } = getTokenAmount(x, y, k, value)

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
  const { x, y, k } = await space.token()
  const { newX, newY, ethAmount, tokenAmountAfterFee, creatorFee, protocolFee } = getEthAmount(x, y, k, amount)

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

export async function getSpaceInfo(space: Space) {
  const founder = await space.founder()
  const totalFee = await space.totalFee()
  const { x, y, k } = await space.token()
  const { daoFee, accumulatedRewardsPerShare, orderIndex } = await space.share()
  const { planIndex, subscriptionIndex, subscriptionIncome } = await space.member()
  const { yieldStartTime, yieldAmount, yieldReleased, stakingFee, totalStaked, accumulatedRewardsPerToken } =
    await space.staking()

  return {
    founder,
    totalFee,
    // token
    x,
    y,
    k,

    // share
    daoFee,
    accumulatedRewardsPerShare,
    orderIndex,
    // member
    planIndex,
    subscriptionIndex,
    subscriptionIncome,
    // staking
    yieldStartTime,
    yieldAmount,
    yieldReleased,
    stakingFee,
    totalStaked,
    accumulatedRewardsPerToken,
  }
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
    newX,
    newY,
    newK: newX * newY,
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
    newX,
    newY,
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

export function getReleasedYieldAmount(yieldAmount: bigint, second: bigint | number) {
  return (yieldAmount * BigInt(second)) / BigInt(24 * 60 * 60 * 30 * 365 * 2)
}

type ContributorInfo = {
  account: any
  shares: bigint
  rewards: bigint
  checkpoint: bigint
  exists: boolean
}

export async function getContributor(space: Space, account: any): Promise<ContributorInfo> {
  const contributors = await space.getContributors()
  return contributors.find((item) => item.account === account)!
}

type Plan = {
  uri: string
  price: bigint
  isActive: boolean
}

export async function getPlan(space: Space, id: number | bigint): Promise<Plan> {
  const plans = await space.getPlans()
  return plans.find((item, i) => i === Number(id))!
}

export async function vestedAmount(space: Space, beneficiary: any, timestamp: bigint | number): Promise<bigint> {
  const vestings = await space.getVestings()
  const vesting = vestings.find((item) => item.beneficiary === beneficiary)!

  if (BigInt(timestamp) < vesting.start) {
    return 0n
  } else if (BigInt(timestamp) > vesting.start + vesting.duration) {
    return vesting.allocation
  } else {
    return (vesting.allocation * (BigInt(timestamp) - vesting.start)) / vesting.duration
  }
}

export type Subscription = {
  planId: number | bigint
  account: any
  startTime: bigint
  duration: bigint
  amount: bigint
}

export async function getSubscription(space: Space, planId: number, account: any): Promise<Subscription> {
  const subscriptions = await space.getSubscriptions()
  return subscriptions.find((item) => item.account === account && BigInt(item.planId) === BigInt(planId))!
}

export async function getPlanTokenPricePerSecond(space: Space, planId: number) {
  const plan = await getPlan(space, planId)
  const ethPricePerSecond = plan.price / SECONDS_PER_MONTH
  const { x, y, k } = await space.token()
  const info = getTokenAmount(x, y, k, ethPricePerSecond)
  return info.tokenAmountAfterFee
}
