import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { Fixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Address } from 'hardhat-deploy/types'
import { Share, Space } from 'types'

const planId = 0
const GAS_PRICE = 800000000n
const CREATOR_FEE_PERCENT = precision.token('0.006')
const PROTOCOL_FEE_PERCENT = precision.token('0.004')

const YIELD_DURATION = BigInt(24 * 60 * 60 * 365 * 2) // 2 years

export const PER_TOKEN_PRECISION = precision.token(1, 26)

export const DEFAULT_SUBSCRIPTION_PRICE = precision.token('0.002048')

// 2% to protocol
export const subscriptionFeePercent = precision.token(0.02)

// Genesis App fee percent
export const appFeePercent = precision.token(0.03)

export const SHARES_SUPPLY = 1_000_000n

export const PREMINT_ETH_AMOUNT = precision.token(3.3333)

export const SECONDS_PER_MONTH = BigInt(24 * 60 * 60 * 30) // 30 days
export const SECONDS_PER_DAY = BigInt(24 * 60 * 60) // 24 hours
export const SECONDS_PER_HOUR = BigInt(60 * 60) // 1 hours

export const TWO_YEARS_SECONDS = BigInt(24 * 60 * 60 * 365 * 2) // 2 years

export const initialX = precision.token(30)
export const initialY = precision.token(1073000191)
export const initialK = initialX * initialY

export type SpaceInfo = {
  founder: Address
  // token
  x: bigint
  y: bigint
  k: bigint

  // share
  daoRevenue: bigint
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
  stakingRevenue: bigint
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
  const tx = await f.spaceFactory.connect(account).createSpace(
    {
      appId: 0,
      spaceName: name,
      symbol: name,
      uri: '',
      preBuyEthAmount: 0,
      referral: ZeroAddress,
    },
    { value: precision.token('0.01024') },
  )
  await tx.wait()
  const addresses = await f.spaceFactory.getUserSpaces(account.address)
  const spaceAddr = addresses[addresses.length - 1]
  const space = await getSpace(spaceAddr)
  const info = await getSpaceInfo(space)
  const { newX, newY, newK, tokenAmount } = getTokenAmount(initialX, initialY, initialK, PREMINT_ETH_AMOUNT)

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

  const tx = await space.connect(account).sell(amount, 0, {
    gasPrice: GAS_PRICE,
  })

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
  const founder = await space.owner()
  const { x, y, k } = await space.token()
  const { daoRevenue, accumulatedRewardsPerShare, orderIndex } = await space.share()
  const { planIndex, subscriptionIndex, subscriptionIncome } = await space.member()
  const { yieldStartTime, yieldAmount, yieldReleased, stakingRevenue, totalStaked, accumulatedRewardsPerToken } =
    await space.staking()

  return {
    founder,
    // token
    x,
    y,
    k,

    // share
    daoRevenue,
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
    stakingRevenue,
    totalStaked,
    accumulatedRewardsPerToken,
  }
}

export async function subscribeForMonths(space: Space, account: HardhatEthersSigner, months: number, planId: number) {
  const tokenAmountAfterFee = await getPlanTokenPricePerSecond(space, planId)
  const totalTokenAmount = tokenAmountAfterFee * BigInt(months) * SECONDS_PER_MONTH
  await approve(space, account, totalTokenAmount)
  const tx = await space.connect(account).subscribe(planId, totalTokenAmount, '')
  await tx.wait()
}

export async function subscribe(space: Space, account: HardhatEthersSigner, value: bigint) {
  const { gasUsed: approveGasUsed } = await approve(space, account, value)
  const tx = await space.connect(account).subscribe(planId, value, '', {
    gasPrice: GAS_PRICE,
  })

  const receipt: any = await tx.wait()
  const subGasUsed = receipt.gasUsed as bigint
  const gasUsed = approveGasUsed + subGasUsed
  const gasCost = gasUsed * GAS_PRICE
  return { gasCost }
}

export async function subscribeByEth(space: Space, account: HardhatEthersSigner, ethAmount: bigint, planId = 0) {
  const tx = await space.connect(account).subscribeByEth(planId, '', {
    value: ethAmount,
    gasPrice: GAS_PRICE,
  })

  const receipt: any = await tx.wait()
  const gasUsed = receipt.gasUsed as bigint
  const gasCost = gasUsed * GAS_PRICE
  return { gasCost }
}

export async function unsubscribe(space: Space, account: HardhatEthersSigner, amount: bigint, planId = 0) {
  const tx = await space.connect(account).unsubscribe(planId, amount, {
    gasPrice: GAS_PRICE,
  })

  const receipt: any = await tx.wait()
  const gasUsed = receipt.gasUsed as bigint
  const gasCost = gasUsed * GAS_PRICE
  return { gasCost }
}

export async function distributeSingleSubscription(space: Space, account: HardhatEthersSigner) {
  const tx = await space.connect(account).distributeSingleSubscription(0, account.address)
  await tx.wait()
}

export async function distributeSubscriptionRewards(space: Space, minPastDuration = 0n) {
  const tx = await space.distributeSubscriptionRewards(minPastDuration)
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
  const creatorFee = (tokenAmount * CREATOR_FEE_PERCENT) / precision.token(1)
  const protocolFee = (tokenAmount * PROTOCOL_FEE_PERCENT) / precision.token(1)
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
  const creatorFee = (tokenAmount * CREATOR_FEE_PERCENT) / precision.token(1)
  const protocolFee = (tokenAmount * PROTOCOL_FEE_PERCENT) / precision.token(1)
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

export function getEthAmountWithoutFee(x: bigint, y: bigint, k: bigint, tokenAmount: bigint) {
  const newY = y + tokenAmount
  const newX = (k + newY - 1n) / newY
  return x - newX
}

export function getTokenAmountWithoutFee(x: bigint, y: bigint, k: bigint, ethAmount: bigint) {
  const newX = x + ethAmount
  const newY = (k + newX - 1n) / newX
  return y - newY
}

export function getTokenPricePerSecond(x: bigint, y: bigint, k: bigint) {
  const monthlyPrice = precision.token('0.002048')
  const SECONDS_PER_MONTH = BigInt(24 * 60 * 60 * 30) // 30 days
  const ethPricePerSecond = monthlyPrice / SECONDS_PER_MONTH
  const { tokenAmountAfterFee } = getTokenAmount(x, y, k, ethPricePerSecond)
  return tokenAmountAfterFee
}

export function getTokenPricePerSecondWithMonthlyPrice(x: bigint, y: bigint, k: bigint, monthlyPrice: bigint) {
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
  return (yieldAmount * BigInt(second)) / TWO_YEARS_SECONDS
}

export async function releasedYieldAmount(space: Space, timestamp: bigint) {
  const { yieldStartTime, yieldAmount } = await space.staking()

  if (timestamp > yieldStartTime + YIELD_DURATION) return yieldAmount
  return (yieldAmount * (timestamp - yieldStartTime)) / YIELD_DURATION
}

type Contributor = {
  account: any
  shares: bigint
  rewards: bigint
  checkpoint: bigint
}

export async function getContributor(space: Space, account: any): Promise<Contributor> {
  const contributors = await space.getContributors()
  return contributors.find((item) => item.account === account)!
}

type Plan = {
  uri: string
  price: bigint
  minEthAmount: bigint
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

/**
 * Calculates the consumed amount and remaining duration of a subscription.
 *
 * @param startTime - The start time of the subscription in seconds since epoch.
 * @param duration - The total duration of the subscription in seconds.
 * @param amount - The total amount associated with the subscription.
 * @param currentBlockTime - The current time to calculate consumption against, in seconds since epoch.
 * @returns An object containing the consumed amount and the remaining duration.
 */
export function calculateSubscriptionConsumed(
  startTime: bigint,
  duration: bigint,
  amount: bigint,
  currentBlockTime: bigint,
): { consumedAmount: bigint; remainingDuration: bigint } {
  if (startTime === 0n || currentBlockTime < startTime) {
    return { consumedAmount: 0n, remainingDuration: 0n }
  }

  const pastDuration = currentBlockTime - startTime

  if (pastDuration >= duration) {
    return { consumedAmount: amount, remainingDuration: 0n }
  }

  const remainingDuration = duration - pastDuration
  const consumedAmount = (amount * pastDuration) / duration

  return { consumedAmount, remainingDuration }
}

export async function getPlanTokenPricePerSecond(space: Space, planId: number) {
  const plan = await getPlan(space, planId)
  const ethPricePerSecond = plan.price / SECONDS_PER_MONTH
  const { x, y, k } = await space.token()
  const info = getTokenAmount(x, y, k, ethPricePerSecond)
  return info.tokenAmountAfterFee
}

export function stringToCode(code: string) {
  if (!code.length) return '0x0000000000000000000000000000000000000000000000000000000000000000'

  // console.log(
  //   '======ethers.encodeBytes32String(code):',
  //   ethers.encodeBytes32String(code),
  //   ethers.decodeBytes32String(ethers.encodeBytes32String(code)),
  // )

  return ethers.encodeBytes32String(code)
}

export async function createCode(space: Space, account: HardhatEthersSigner, code: string) {
  const tx = await space.connect(account).createCode(stringToCode(code), { gasPrice: GAS_PRICE })
  await tx.wait()
}

export async function updateCode(space: Space, account: HardhatEthersSigner, code: string) {
  const tx = await space.connect(account).updateCode(stringToCode(code), { gasPrice: GAS_PRICE })
  await tx.wait()
}

export async function bindCode(space: Space, account: HardhatEthersSigner, code: string) {
  const tx = await space.connect(account).bindCode(stringToCode(code), { gasPrice: GAS_PRICE })
  await tx.wait()
}

export async function updateTier(
  space: Space,
  account: HardhatEthersSigner,
  id: bigint,
  memberCountBreakpoint: bigint,
  rebateRate: bigint,
) {
  const tx = await space.connect(account).updateTier(id, memberCountBreakpoint, rebateRate)
  await tx.wait()
}

export async function checkSubscriptionDuration(
  space: Space,
  account: HardhatEthersSigner,
  durationDays: number,
  planId = 0,
) {
  const subscription = await getSubscription(space, planId, account.address)

  // expect(subscription1.amount).to.be.equal(user1Balance0 + user1Balance2)

  const now = BigInt(await time.latest())
  expect(subscription.planId).to.be.equal(planId)
  expect(subscription.startTime).to.be.equal(now)
  expect(subscription.account).to.be.equal(account.address)

  const days = subscription.duration / SECONDS_PER_DAY
  const hours = subscription.duration / SECONDS_PER_HOUR
  const minutes = subscription.duration / 60n

  expect(days).to.be.equal(durationDays)
  expect(hours).to.be.equal(durationDays * 24)
  expect(Math.abs(Number(minutes - BigInt(durationDays * 24 * 60)))).to.be.lessThan(10)

  const remainDuration = await getRemainDuration(subscription)
  const remainDays = remainDuration / SECONDS_PER_DAY
  const remainHours = remainDuration / SECONDS_PER_HOUR

  expect(remainDays).to.be.equal(durationDays)
  expect(remainHours).to.be.equal(durationDays * 24)
}
export async function getRemainDuration(subscription: Subscription) {
  const remain = subscription.startTime + subscription.duration - BigInt(await time.latest())
  return remain >= 0n ? remain : BigInt(0)
}
