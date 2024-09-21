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
  SECONDS_PER_MONTH,
  TWO_YEARS_SECONDS,
} from './utils'
import { Space } from 'types'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { network } from 'hardhat'

describe('Staking Yield', function () {
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

  const oneMonth = Number(SECONDS_PER_MONTH)

  it('All yieldAmount release to stakingFee after 2 years', async () => {
    const t0 = await time.latest()
    const staking0 = await space.staking()
    expect(staking0.totalStaked).to.equal(0)
    expect(staking0.stakingFee).to.equal(0)
    expect(staking0.accumulatedRewardsPerToken).to.equal(0)
    expect(staking0.yieldAmount).to.equal(premint)
    expect(staking0.yieldReleased).to.equal(0)

    await time.increaseTo((await time.latest()) + oneMonth * 6)

    await claimStakingRewards(space, f.user0)

    {
      const t = await time.latest()
      const amount = await releasedYieldAmount(space, BigInt(t))
      const releasedAmount = getReleasedYieldAmount(staking0.yieldAmount, t - t0)

      expect(amount).to.equal(releasedAmount)
      const staking = await space.staking()
      expect(staking.totalStaked).to.equal(0)
      expect(staking.stakingFee).to.equal(amount)
      expect(staking.accumulatedRewardsPerToken).to.equal(0)
      expect(staking.yieldAmount).to.equal(premint)
      expect(staking.yieldReleased).to.equal(amount)
    }

    await time.increaseTo((await time.latest()) + oneMonth * 6)

    await claimStakingRewards(space, f.user0)

    {
      const t = await time.latest()
      const amount = await releasedYieldAmount(space, BigInt(t))
      const releasedAmount = getReleasedYieldAmount(staking0.yieldAmount, t - t0)

      expect(amount).to.equal(releasedAmount)
      const staking = await space.staking()
      expect(staking.totalStaked).to.equal(0)
      expect(staking.stakingFee).to.equal(amount)
      expect(staking.accumulatedRewardsPerToken).to.equal(0)
      expect(staking.yieldAmount).to.equal(premint)
      expect(staking.yieldReleased).to.equal(amount)
    }

    await time.increaseTo((await time.latest()) + oneMonth * 6)

    await claimStakingRewards(space, f.user0)

    {
      const t = await time.latest()
      const amount = await releasedYieldAmount(space, BigInt(t))
      const releasedAmount = getReleasedYieldAmount(staking0.yieldAmount, t - t0)

      expect(amount).to.equal(releasedAmount)
      const staking = await space.staking()
      expect(staking.totalStaked).to.equal(0)
      expect(staking.stakingFee).to.equal(amount)
      expect(staking.accumulatedRewardsPerToken).to.equal(0)
      expect(staking.yieldAmount).to.equal(premint)
      expect(staking.yieldReleased).to.equal(amount)
    }

    // make it more then 2 years
    await time.increaseTo((await time.latest()) + oneMonth * 8)

    await claimStakingRewards(space, f.user0)

    {
      const t = await time.latest()
      const amount = await releasedYieldAmount(space, BigInt(t))

      // released amount should be premint
      expect(amount).to.equal(premint)

      const staking = await space.staking()
      expect(staking.totalStaked).to.equal(0)
      expect(staking.stakingFee).to.equal(amount)
      expect(staking.accumulatedRewardsPerToken).to.equal(0)
      expect(staking.yieldAmount).to.equal(premint)
      expect(staking.yieldReleased).to.equal(amount)

      expect(staking.yieldReleased).to.equal(staking.yieldReleased)
    }
  })

  it('All released yield should reward to 1 staker', async () => {
    const staking0 = await space.staking()
    await buy(space, f.user1, precision.token(1))
    await stake(space, f.user1, precision.token(10000))

    const user1Balance0 = await space.balanceOf(f.user1)

    await time.increase(oneMonth * 6)
    await claimStakingRewards(space, f.user1)

    const staking1 = await space.staking()
    const user1Balance1 = await space.balanceOf(f.user1)
    const walletBalance1 = user1Balance1 - user1Balance0
    expect(walletBalance1).to.equal(staking1.yieldReleased)

    await time.setNextBlockTimestamp(staking0.yieldStartTime + TWO_YEARS_SECONDS)
    await claimStakingRewards(space, f.user1)

    const staking2 = await space.staking()
    const user1Balance2 = await space.balanceOf(f.user1)
    const walletBalance2 = user1Balance2 - user1Balance0
    expect(walletBalance2).to.equal(staking2.yieldReleased)
    expect(walletBalance2).to.equal(premint)
  })

  it.only('All released yield should reward to 2 stakers', async () => {
    const staking0 = await space.staking()
    await buy(space, f.user1, precision.token(1))
    await buy(space, f.user2, precision.token(1))

    await stake(space, f.user1, precision.token(10000))
    await stake(space, f.user2, precision.token(10000))

    const user1Balance0 = await space.balanceOf(f.user1)
    const user2Balance0 = await space.balanceOf(f.user2)

    await time.increase(oneMonth)

    await time.setNextBlockTimestamp(staking0.yieldStartTime + TWO_YEARS_SECONDS)

    await claimStakingRewards(space, f.user1)
    await claimStakingRewards(space, f.user2)

    const staking1 = await space.staking()

    const user1Balance1 = await space.balanceOf(f.user1)
    const user2Balance1 = await space.balanceOf(f.user2)

    const walletBalance = user1Balance1 + user2Balance1 - user1Balance0 - user2Balance0

    expect(walletBalance).to.equal(staking1.yieldReleased)
    expect(walletBalance).to.equal(premint)
  })
})
