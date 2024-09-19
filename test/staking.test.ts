import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import {
  buy,
  claimStakingRewards,
  createSpace,
  getReleasedYieldAmount,
  getSpaceInfo,
  looseEqual,
  sell,
  stake,
  unstake,
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
    const user1TokenBalance0 = await space.balanceOf(f.user1)
    await expect(stake(space, f.user2, user1TokenBalance0)).to.revertedWithCustomError(
      space,
      'ERC20InsufficientBalance',
    )
    await stake(space, f.user1, user1TokenBalance0)

    // stakers.length +1
    const stakers = await space.getStakers()
    expect(stakers.length).to.equal(1)

    // check staked amount
    const info = await getSpaceInfo(space)
    expect(stakers[0].staked).to.equal(user1TokenBalance0)
    expect(info.totalStaked).to.equal(stakers[0].staked)
    expect(info.totalStaked).to.equal(user1TokenBalance0)

    // check staked amount with funds
    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.equal(info.totalStaked + creatorFee + premint)

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
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.equal(premint)

    // step 1
    const { creatorFee } = await buy(space, f.user1, precision.token(10))

    const user1TokenBalance0 = await space.balanceOf(f.user1)

    // step 2
    await stake(space, f.user1, user1TokenBalance0 / 4n)

    // step 3
    await stake(space, f.user1, user1TokenBalance0 / 4n)

    // stakers.length +1
    const stakers = await space.getStakers()
    expect(stakers.length).to.equal(1)

    // check staked amount
    const info = await getSpaceInfo(space)
    looseEqual(stakers[0].staked, user1TokenBalance0 / 2n)
    looseEqual(info.totalStaked, user1TokenBalance0 / 2n)
    looseEqual(info.totalStaked, stakers[0].staked)

    // check staked amount with funds
    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.equal(info.totalStaked + creatorFee + premint)

    // user1 all tokens is staked
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    looseEqual(user1TokenBalance1, user1TokenBalance0 / 2n)
  })

  /**
   * case step:
   * 1. user1 buy 10 eth
   * 2. user1 stake all token
   * 3. user1 unstake all tokens
   */
  it('Case3: unstake all', async () => {
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.equal(premint)

    // step 1
    const { creatorFee } = await buy(space, f.user1, precision.token(10))

    const user1TokenBalance0 = await space.balanceOf(f.user1)

    const info0 = await getSpaceInfo(space)
    expect(info0.stakingFee).to.equal(0n)
    expect(info0.totalStaked).to.equal(0n)
    expect(info0.accumulatedRewardsPerToken).to.equal(0n)

    /** step 2 */
    await stake(space, f.user1, user1TokenBalance0)

    /** step 3 */
    await expect(unstake(space, f.user1, 0n)).to.revertedWithCustomError(f.staking, 'AmountIsZero')
    await expect(unstake(space, f.user2, user1TokenBalance0)).to.revertedWithCustomError(f.staking, 'AmountTooLarge')

    await unstake(space, f.user1, user1TokenBalance0)

    const stakers = await space.getStakers()
    expect(stakers.length).to.equal(0)

    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(user1TokenBalance0)

    const info1 = await getSpaceInfo(space)
    expect(info1.stakingFee).to.equal(0n)
    expect(info1.totalStaked).to.equal(0n)
    // expect(info1.accumulatedRewardsPerToken).to.equal(0n)
  })

  /**
   * case step:
   * 1. user1 buy 10 eth token
   * 2. user1 stake all tokens
   * 3. user1 buy 10 eth token again
   * 4. user1 claim
   */
  it('Case4: simple claim', async () => {
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.equal(premint)

    // step 1
    const { creatorFee: creatorFee1 } = await buy(space, f.user1, precision.token(10))
    const user1TokenBalance0 = await space.balanceOf(f.user1)

    // step 2
    await stake(space, f.user1, user1TokenBalance0)

    const stakers = await space.getStakers()

    expect(stakers.length).to.equal(1)

    const info0 = await getSpaceInfo(space)

    // all user1's token staked
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(0)
    const time0 = await time.latest()

    // step 3
    const { creatorFee: creatorFee2 } = await buy(space, f.user1, precision.token(10))

    const time1 = await time.latest()

    const info1 = await getSpaceInfo(space)
    const releasedYieldAmount1 = getReleasedYieldAmount(info1.yieldAmount, BigInt(time1 - time0))
    const user1Rewards1 = await space.currentUserRewards(f.user1.address)

    looseEqual(info1.stakingFee + releasedYieldAmount1, user1Rewards1)
    looseEqual(info1.stakingFee, (creatorFee2 * 3n) / 10n + info1.yieldReleased) // 30%

    const user1TokenBalance2 = await space.balanceOf(f.user1)

    // step 4
    await claimStakingRewards(space, f.user1)

    const time2 = await time.latest()
    const releasedYieldAmount2 = getReleasedYieldAmount(info1.yieldAmount, BigInt(time2 - time1))

    const rewardsPerToken2 = await space.currentRewardsPerToken()
    const info2 = await getSpaceInfo(space)

    expect(info2.stakingFee).to.equal(0)
    expect(info2.accumulatedRewardsPerToken).to.equal(rewardsPerToken2)

    const user1TokenBalance3 = await space.balanceOf(f.user1)

    looseEqual(user1Rewards1 + releasedYieldAmount2, user1TokenBalance3 - user1TokenBalance2)

    // all staking rewards claimed to user1
    looseEqual(info1.stakingFee + releasedYieldAmount1 + releasedYieldAmount2, user1TokenBalance3 - user1TokenBalance2)
  })

  it.skip('Case2: multi user buy and sell, multi user staking', async () => {
    const spaceName = 'TEST'
    const { spaceAddr, space } = await createSpace(f, f.user0, spaceName)

    const time0 = await time.latest()

    const balanceOfSpace0 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace0).to.equal(premint)

    /** user1 buy 10eth token and stake */
    const { creatorFee: creatorFee1 } = await buy(space, f.user1, precision.token(10))
    const user1TokenBalance0 = await space.balanceOf(f.user1)
    await stake(space, f.user1, user1TokenBalance0)
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(0)

    // check space's funds
    const balanceOfSpace1 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace1).to.equal(user1TokenBalance0 + creatorFee1 + premint)

    /** user2 buy teth token and stake */
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
    console.log('===info0:', info0.daoFee)

    const user1TokenBalance3 = await space.balanceOf(f.user1)
    const user2TokenBalance3 = await space.balanceOf(f.user2)

    // claim rewards
    await claimStakingRewards(space, f.user1)
    await claimStakingRewards(space, f.user2)

    const time1 = await time.latest()
    const releasedYieldAmount = getReleasedYieldAmount(info0.yieldAmount, BigInt(time1 - time0))

    console.log('=====time1 - time0:', time1 - time0)

    const user1TokenBalance4 = await space.balanceOf(f.user1)
    const user2TokenBalance4 = await space.balanceOf(f.user2)

    const user1RewardsToWallet = user1TokenBalance4 - user1TokenBalance3
    const user2RewardsToWallet = user2TokenBalance4 - user2TokenBalance3

    const info1 = await getSpaceInfo(space)

    expect(info1.stakingFee).to.equal(0)

    // console.log('===========releasedYieldAmount:', releasedYieldAmount, info0.daoFee, info1.daoFee)
    // console.log('======info1.yieldReleased:', info1.yieldReleased)

    // all staking rewards claimed to user1 and user2
    // TODO:
    // expect(user1RewardsToWallet + user2RewardsToWallet).to.equal(info1.totalFee - info0.daoFee + info1.yieldReleased)
    // looseEqual(user1RewardsToWallet + user2RewardsToWallet, info1.totalFee - info0.daoFee + info1.yieldReleased)
  })

  afterEach(async () => {
    const info = await getSpaceInfo(space)
    const stakers = await space.getStakers()
    const sumStaked = stakers.reduce((acc, staker) => acc + staker.staked, 0n)
    expect(info.totalStaked).to.equal(sumStaked)
  })
})
