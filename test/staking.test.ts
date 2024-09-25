import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import {
  approve,
  buy,
  claimStakingRewards,
  createSpace,
  getReleasedYieldAmount,
  releasedYieldAmount,
  getSpaceInfo,
  looseEqual,
  sell,
  stake,
  unstake,
  PER_TOKEN_PRECISION,
} from './utils'
import { Space } from 'types'
import { time } from '@nomicfoundation/hardhat-network-helpers'

describe('Staking', function () {
  let f: Fixture
  let space: Space
  let spaceAddr: string
  let premint = BigInt(0)

  beforeEach(async () => {
    f = await deployFixture()
    const spaceName = 'Test Space'
    const res = await createSpace(f, f.user0, spaceName)
    space = res.space
    spaceAddr = res.spaceAddr
    premint = res.premint
  })

  /**
   * case step:
   * 1. user1 buy 10 eth
   * 2. user1 stake all token
   */
  it('Case1: simple stake', async () => {
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.equal(premint)

    // step 1
    const { creatorFee } = await buy(space, f.user1, precision.token(10))

    /** step 2 */
    const user1TokenBalance = await space.balanceOf(f.user1)
    await expect(stake(space, f.user2, user1TokenBalance)).to.revertedWithCustomError(space, 'ERC20InsufficientBalance')

    await approve(space, f.user1, user1TokenBalance)
    await expect(space.connect(f.user1).stake(user1TokenBalance))
      .to.emit(space, 'Staked')
      .withArgs(f.user1.address, user1TokenBalance)

    // check staked amount
    const info = await getSpaceInfo(space)
    const spaceBalance1 = await space.balanceOf(spaceAddr)

    expect(info.totalStaked).to.equal(user1TokenBalance)
    expect(spaceBalance1).to.equal(info.totalStaked + creatorFee + premint)

    // check staker
    const staker = await space.getStaker(f.user1.address)
    expect(staker.staked).to.equal(user1TokenBalance)
    expect(staker.account).to.equal(f.user1.address)
    expect(staker.staked).to.equal(info.totalStaked)
    expect(staker.realized).to.equal(0)
    expect(staker.checkpoint).to.equal(0)

    // user1 all tokens is staked
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(0)
  })

  /**
   * case step:
   * 1. user1 buy 10 eth
   * 2. user1 stake 1/4 tokens
   * 3. user1 stake 1/4 tokens
   */
  it('Case2: stake', async () => {
    const time0 = await time.latest()
    // step 1
    const { creatorFee } = await buy(space, f.user1, precision.token(10))

    const user1TokenBalance0 = await space.balanceOf(f.user1)

    // step 2
    await stake(space, f.user1, user1TokenBalance0 / 4n)

    const staking1 = await space.staking()
    const staker1 = await space.getStaker(f.user1.address)
    expect(staker1.checkpoint).to.equal(0)

    // step 3
    await stake(space, f.user1, user1TokenBalance0 / 4n)
    const time1 = await time.latest()

    const timeGap = time1 - time0

    // check staked amount
    const info = await getSpaceInfo(space)
    const stakedAmount = user1TokenBalance0 / 4n + user1TokenBalance0 / 4n
    expect(info.totalStaked).to.equal(stakedAmount)

    // check staking storage
    const staking2 = await space.staking()
    const releasedAmount = getReleasedYieldAmount(staking2.yieldAmount, timeGap)
    const releasableAmount = await releasedYieldAmount(space, BigInt(time1))
    expect(releasedAmount).to.equal(releasableAmount - 0n)
    expect(staking2.yieldReleased).to.equal(releasedAmount)
    expect(staking2.stakingRevenue).to.equal(0)

    const stakingRevenue = releasedAmount
    const accumulated = (stakingRevenue * PER_TOKEN_PRECISION) / staking1.totalStaked

    expect(staking2.accumulatedRewardsPerToken).to.equal(accumulated)

    // check staker
    const staker2 = await space.getStaker(f.user1.address)
    expect(staker2.staked).to.equal(stakedAmount)
    expect(staker2.account).to.equal(f.user1.address)
    expect(staker2.staked).to.equal(info.totalStaked)

    const realized = (staker1.staked * accumulated) / PER_TOKEN_PRECISION
    expect(staker2.realized).to.equal(realized)
    expect(staker2.checkpoint).to.equal(accumulated)

    // check staked amount with funds
    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.equal(info.totalStaked + creatorFee + premint)

    // check remind amount
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(user1TokenBalance0 - stakedAmount)
  })

  /**
   * case step:
   * 1. user1 buy 10 eth
   * 2. user1 stake all token
   * 3. user1 unstake all tokens
   */
  it('Case3: unstake all', async () => {
    // step 1
    await buy(space, f.user1, precision.token(10))

    const user1TokenBalance0 = await space.balanceOf(f.user1)

    const info0 = await getSpaceInfo(space)
    expect(info0.stakingRevenue).to.equal(0n)
    expect(info0.totalStaked).to.equal(0n)
    expect(info0.accumulatedRewardsPerToken).to.equal(0n)

    /** step 2 */
    await stake(space, f.user1, user1TokenBalance0)

    await expect(unstake(space, f.user1, 0n)).to.revertedWithCustomError(f.staking, 'AmountIsZero')
    await expect(unstake(space, f.user2, user1TokenBalance0)).to.revertedWithCustomError(f.staking, 'AmountTooLarge')

    /** step 3 */
    await unstake(space, f.user1, user1TokenBalance0)

    const staking = await space.staking()

    /** check staker */
    {
      const staker = await space.getStaker(f.user1.address)
      expect(staker.staked).to.equal(0n)
      expect(staker.checkpoint).to.equal(staking.accumulatedRewardsPerToken)

      const realized = (user1TokenBalance0 * staking.accumulatedRewardsPerToken) / PER_TOKEN_PRECISION
      expect(staker.realized).to.equal(realized)
    }

    /** check accumulated */
    const releasableAmount = await releasedYieldAmount(space, BigInt(await time.latest()))
    const accumulated = (releasableAmount * PER_TOKEN_PRECISION) / user1TokenBalance0
    expect(staking.accumulatedRewardsPerToken).to.equal(accumulated)

    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(user1TokenBalance0)

    const info1 = await getSpaceInfo(space)
    expect(info1.stakingRevenue).to.equal(0n)
    expect(info1.totalStaked).to.equal(0n)
  })

  /**
   * case step:
   * 1. user1 buy 10 eth token
   * 2. user1 stake all tokens
   * 3. user1 buy 10 eth token again
   * 4. user1 claim
   */
  it('Case4: simple claim', async () => {
    // step 1
    await buy(space, f.user1, precision.token(10))
    const user1TokenBalance0 = await space.balanceOf(f.user1)

    // step 2
    await stake(space, f.user1, user1TokenBalance0)

    const info0 = await getSpaceInfo(space)

    // all user1's token staked
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(0)
    const time0 = await time.latest()

    // step 3
    const { creatorFee } = await buy(space, f.user1, precision.token(10))

    const time1 = await time.latest()

    const info1 = await getSpaceInfo(space)
    const releasedYieldAmount1 = getReleasedYieldAmount(info1.yieldAmount, BigInt(time1 - time0))
    const user1Rewards1 = await space.currentUserRewards(f.user1.address)

    looseEqual(info1.stakingRevenue + releasedYieldAmount1, user1Rewards1)
    looseEqual(info1.stakingRevenue, (creatorFee * 3n) / 10n + info1.yieldReleased) // 30%

    const user1TokenBalance2 = await space.balanceOf(f.user1)

    // step 4
    await claimStakingRewards(space, f.user1)

    const time2 = await time.latest()
    const releasedYieldAmount2 = getReleasedYieldAmount(info1.yieldAmount, BigInt(time2 - time1))

    const info2 = await getSpaceInfo(space)

    expect(info2.stakingRevenue).to.equal(0)
    // expect(info2.accumulatedRewardsPerToken).to.equal(rewardsPerToken2)

    const user1TokenBalance3 = await space.balanceOf(f.user1)

    looseEqual(user1Rewards1 + releasedYieldAmount2, user1TokenBalance3 - user1TokenBalance2)

    // all staking rewards claimed to user1
    looseEqual(
      info1.stakingRevenue + releasedYieldAmount1 + releasedYieldAmount2,
      user1TokenBalance3 - user1TokenBalance2,
    )
  })

  it('Case2: multi user buy and sell, multi user staking', async () => {
    const time0 = await time.latest()

    const balanceOfSpace0 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace0).to.equal(premint)

    /** user1 buy 10eth token and stake */
    const { creatorFee: creatorFee1 } = await buy(space, f.user1, precision.token(10))

    const time1 = await time.latest()

    const user1TokenBalance0 = await space.balanceOf(f.user1)
    await stake(space, f.user1, user1TokenBalance0)
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(0)

    // check space's funds
    const balanceOfSpace1 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace1).to.equal(user1TokenBalance0 + creatorFee1 + premint)

    /** user2 buy 5 eth token and stake */
    const { creatorFee: creatorFee2 } = await buy(space, f.user2, precision.token(5))
    const user2TokenBalance0 = await space.balanceOf(f.user2)
    await stake(space, f.user2, user2TokenBalance0)
    const user1TokenBalance2 = await space.balanceOf(f.user2)
    expect(user1TokenBalance2).to.equal(0)

    // check space's funds
    const balanceOfSpace2 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace2).to.equal(user1TokenBalance0 + creatorFee1 + user2TokenBalance0 + creatorFee2 + premint)

    /**
     *  user3 buy and sell to generate some fees
     */
    const { creatorFee: creatorFee3 } = await buy(space, f.user3, precision.token(100))
    const user3TokenBalance0 = await space.balanceOf(f.user3)

    const { creatorFee: creatorFee4 } = await sell(space, f.user3, user3TokenBalance0)

    // user3 all token sold out
    const user3TokenBalance1 = await space.balanceOf(f.user3)
    expect(user3TokenBalance1).to.equal(0)

    const allProtocolFee = creatorFee1 + creatorFee2 + creatorFee3 + creatorFee4

    // check space's funds
    const balanceOfSpace3 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace3).to.equal(user1TokenBalance0 + user2TokenBalance0 + allProtocolFee + premint)

    const info0 = await getSpaceInfo(space)

    const user1TokenBalance3 = await space.balanceOf(f.user1)
    const user2TokenBalance3 = await space.balanceOf(f.user2)

    await time.setNextBlockTimestamp((await time.latest()) + 100000)
    // claim rewards
    await Promise.all([claimStakingRewards(space, f.user1), claimStakingRewards(space, f.user2)])

    const time2 = await time.latest()
    const releasedYield0 = getReleasedYieldAmount(info0.yieldAmount, BigInt(time2 - time0))
    const releasedYield1 = await releasedYieldAmount(space, BigInt(await time.latest()))
    expect(releasedYield0).to.equal(releasedYield1)

    const user1TokenBalance4 = await space.balanceOf(f.user1)
    const user2TokenBalance4 = await space.balanceOf(f.user2)

    const user1RewardsToWallet = user1TokenBalance4 - user1TokenBalance3
    const user2RewardsToWallet = user2TokenBalance4 - user2TokenBalance3

    const info1 = await getSpaceInfo(space)

    expect(info1.stakingRevenue).to.equal(0)

    // console.log('===========releasedYieldAmount:', releasedYieldAmount, info0.daoRevenue, info1.daoRevenue)
    // console.log('======info1.yieldReleased:', info1.yieldReleased)

    const createFees = ((creatorFee2 + creatorFee3 + creatorFee4) * 3n) / 10n

    const released = getReleasedYieldAmount(info0.yieldAmount, BigInt(time2 - time0 - 1))

    // all staking rewards claimed to user1 and user2
    expect(precision.decimal(user1RewardsToWallet + user2RewardsToWallet - (released + createFees))).to.lessThan(1)
  })
})
