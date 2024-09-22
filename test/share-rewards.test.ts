import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { Space } from 'types'
import {
  buy,
  claimShareRewards,
  createSpace,
  distributeSingleSubscription,
  distributeSubscriptionRewards,
  getContributor,
  getSpaceInfo,
  looseEqual,
  sell,
  SHARES_SUPPLY,
  subscribe,
  transferShares,
} from './utils'
import { time } from '@nomicfoundation/hardhat-network-helpers'

describe('Share rewards', function () {
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
   * 1. user1 buy 1 eth
   * 2. user0 claimShareRewards
   */
  describe('Buy fee rewards to one user', () => {
    it('claimShareRewards directly', async () => {
      const user0Balance0 = await space.balanceOf(f.user0.address)

      /** step 1 */
      const buyInfo = await buy(space, f.user1, precision.token(1))

      const info0 = await getSpaceInfo(space)
      expect(info0.daoFee).to.equal(buyInfo.creatorFee)
      expect(info0.accumulatedRewardsPerShare).to.equal(0)

      /** step 2 */
      await expect(space.connect(f.user0).claimShareRewards())
        .to.emit(space, 'ShareRewardsClaimed')
        .withArgs(f.user0.address, buyInfo.creatorFee)

      const user0Balance1 = await space.balanceOf(f.user0.address)
      expect(user0Balance1 - user0Balance0).to.equal(buyInfo.creatorFee)

      const info1 = await getSpaceInfo(space)
      expect(info1.daoFee).to.equal(0)

      const delta = calculateRewardsPerShareDelta(buyInfo.creatorFee)
      expect(info1.accumulatedRewardsPerShare).to.equal(delta)

      const contributor = await getContributor(space, f.user0.address)
      expect(contributor.account).to.equal(f.user0.address)
      expect(contributor.checkpoint).to.equal(delta)
    })

    it('claimShareRewards after distribute', async () => {
      const user0Balance0 = await space.balanceOf(f.user0.address)

      /** step 1 */
      const buyInfo = await buy(space, f.user1, precision.token(1))

      const info0 = await getSpaceInfo(space)
      expect(info0.daoFee).to.equal(buyInfo.creatorFee)
      expect(info0.accumulatedRewardsPerShare).to.equal(0)

      const tx0 = await space.distributeShareRewards()
      await tx0.wait()

      {
        const info = await getSpaceInfo(space)
        const delta = calculateRewardsPerShareDelta(buyInfo.creatorFee)

        expect(info.daoFee).to.equal(0)
        expect(info.accumulatedRewardsPerShare).to.equal(delta)
      }

      const tx1 = await space.distributeShareRewards()
      await tx1.wait()

      {
        const info = await getSpaceInfo(space)
        const delta = calculateRewardsPerShareDelta(buyInfo.creatorFee)

        expect(info.daoFee).to.equal(0)
        expect(info.accumulatedRewardsPerShare).to.equal(delta)
      }

      /** step 2 */
      await expect(space.connect(f.user0).claimShareRewards())
        .to.emit(space, 'ShareRewardsClaimed')
        .withArgs(f.user0.address, buyInfo.creatorFee)

      const user0Balance1 = await space.balanceOf(f.user0.address)
      expect(user0Balance1 - user0Balance0).to.equal(buyInfo.creatorFee)

      const info1 = await getSpaceInfo(space)
      expect(info1.daoFee).to.equal(0)

      const delta = calculateRewardsPerShareDelta(buyInfo.creatorFee)
      expect(info1.accumulatedRewardsPerShare).to.equal(delta)

      const contributor = await getContributor(space, f.user0.address)
      expect(contributor.account).to.equal(f.user0.address)
      expect(contributor.checkpoint).to.equal(delta)
    })
    //
  })

  /**
   * 1. user1 buy 1 eth
   * 2. user1 sell all token
   * 3. user0 claimShareRewards
   */
  it('Buy&Sell fee rewards to 1 user', async () => {
    const user0Balance0 = await space.balanceOf(f.user0.address)

    /** step 1 */
    const buyInfo = await buy(space, f.user1, precision.token(1))

    const user1Balance0 = await space.balanceOf(f.user1.address)
    expect(user1Balance0).to.equal(buyInfo.tokenAmountAfterFee)

    /** step 2 */
    const sellInfo = await sell(space, f.user1, user1Balance0)

    const user1Balance1 = await space.balanceOf(f.user1.address)
    expect(user1Balance1).to.equal(0)

    const info0 = await getSpaceInfo(space)
    expect(info0.daoFee).to.equal(buyInfo.creatorFee + sellInfo.creatorFee)
    expect(info0.accumulatedRewardsPerShare).to.equal(0)

    /** step 3 */
    await claimShareRewards(space, f.user0)

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.equal(premint)

    const user0Balance1 = await space.balanceOf(f.user0.address)
    expect(user0Balance1 - user0Balance0).to.equal(buyInfo.creatorFee + sellInfo.creatorFee)

    const info1 = await getSpaceInfo(space)
    expect(info1.daoFee).to.equal(0)

    const delta = calculateRewardsPerShareDelta(buyInfo.creatorFee + sellInfo.creatorFee)
    expect(info1.accumulatedRewardsPerShare).to.equal(delta)

    const contributor = await getContributor(space, f.user0.address)
    expect(contributor.account).to.equal(f.user0.address)
    expect(contributor.checkpoint).to.equal(delta)
  })

  /**
   * case step:
   * 1. founder transfer 2/10 shares to user1
   * 2. founder transfer 3/10 shares to user2
   * 3. user9 buy 1 eth
   * 4. user0 claimShareRewards
   * 5. user1 claimShareRewards
   * 6. user2 claimShareRewards
   */
  it('Buy fee rewards to 2 users', async () => {
    // step 1
    await transferShares(space, f.user0, f.user1, (SHARES_SUPPLY * 2n) / 10n)

    // step 2
    await transferShares(space, f.user0, f.user2, (SHARES_SUPPLY * 3n) / 10n)

    const user0Balance0 = await space.balanceOf(f.user0.address)
    const user1Balance0 = await space.balanceOf(f.user1.address)
    const user2Balance0 = await space.balanceOf(f.user2.address)

    /** step 3 */
    const buyInfo = await buy(space, f.user9, precision.token(1))

    /** step 2 */
    await claimShareRewards(space, f.user0)
    await claimShareRewards(space, f.user1)
    await claimShareRewards(space, f.user2)

    const spaceBalance = await space.balanceOf(spaceAddr)
    looseEqual(spaceBalance, premint)

    const user0Balance1 = await space.balanceOf(f.user0.address)
    const user1Balance1 = await space.balanceOf(f.user1.address)
    const user2Balance1 = await space.balanceOf(f.user2.address)

    expect(user0Balance1 - user0Balance0).to.equal((buyInfo.creatorFee * 50n) / 100n)
    expect(user1Balance1 - user1Balance0).to.equal((buyInfo.creatorFee * 20n) / 100n)
    expect(user2Balance1 - user2Balance0).to.equal((buyInfo.creatorFee * 30n) / 100n)
  })

  /**
   * 1. user1 buy 0.002048 token (1 month)
   * 2. user1 subscribe 1 month
   * 3. 40 days passed
   * 4. distributeSingleSubscription
   * 5. user0  claim share rewards
   */
  it('Subscription fee rewards to 1 user', async () => {
    const user0Balance0 = await space.balanceOf(f.user0.address)

    /** step 1 */
    const buyInfo = await buy(space, f.user1, precision.token('0.002048'))

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.be.equal(buyInfo.creatorFee + premint)

    const user1Balance0 = await space.balanceOf(f.user1.address)

    /** step 2 */
    await subscribe(space, f.user1, user1Balance0)

    /** step 3 */
    await time.increase(60 * 60 * 24 * 40) // after 40 days

    /** step 4 */
    await distributeSingleSubscription(space, f.user1)

    const info1 = await getSpaceInfo(space)

    const spaceBalance2 = await space.balanceOf(spaceAddr)
    expect(spaceBalance2).to.equal(buyInfo.creatorFee + info1.subscriptionIncome + premint)

    const rewards = await space.currentContributorRewards(f.user0)
    expect(rewards).to.equal(info1.daoFee)

    const tx = await space.distributeShareRewards()
    await tx.wait()

    /** step 5 */
    await claimShareRewards(space, f.user0)

    const user0Balance1 = await space.balanceOf(f.user0.address)
    expect(user0Balance1 - user0Balance0).to.equal(info1.daoFee)

    const info2 = await getSpaceInfo(space)
    expect(info2.daoFee).to.equal(0)

    const spaceBalance3 = await space.balanceOf(spaceAddr)

    expect(spaceBalance3).to.equal(premint)
    expect(spaceBalance3).to.equal(spaceBalance2 - info1.daoFee)
  })

  /**
   * 1. founder transfer 2/10 shares to user1
   * 2. founder transfer 3/10 shares to user2
   * 3. user9 buy 0.002048 token (1 month)
   * 4. user9 subscribe 1 month
   * 5. 40 days passed
   * 6. distributeSubscriptionRewards
   * 7. user0 claim share rewards
   * 7. user1 claim share rewards
   * 8. user2 claim share rewards
   */
  it('Subscription fee rewards to 2 users', async () => {
    // step 1
    await transferShares(space, f.user0, f.user1, (SHARES_SUPPLY * 2n) / 10n)

    // step 2
    await transferShares(space, f.user0, f.user2, (SHARES_SUPPLY * 3n) / 10n)

    /** step 3 */
    const buyInfo = await buy(space, f.user9, precision.token('0.002048'))

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.be.equal(buyInfo.creatorFee + premint)

    const user9Balance0 = await space.balanceOf(f.user9.address)

    /** step 4 */
    await subscribe(space, f.user9, user9Balance0)

    /** step 5 */
    await time.increase(60 * 60 * 24 * 40) // after 40 days

    /** step 6 */
    await distributeSubscriptionRewards(space)

    const user0Balance0 = await space.balanceOf(f.user0.address)
    const user1Balance0 = await space.balanceOf(f.user1.address)
    const user2Balance0 = await space.balanceOf(f.user2.address)

    const info0 = await getSpaceInfo(space)

    /** step 5 */
    await claimShareRewards(space, f.user0)
    await claimShareRewards(space, f.user1)
    await claimShareRewards(space, f.user2)

    // should can claim multiple times
    await claimShareRewards(space, f.user0)
    await claimShareRewards(space, f.user1)
    await claimShareRewards(space, f.user2)

    const user0Balance1 = await space.balanceOf(f.user0.address)
    const user1Balance1 = await space.balanceOf(f.user1.address)
    const user2Balance1 = await space.balanceOf(f.user2.address)

    expect(user0Balance1 - user0Balance0).to.equal((info0.daoFee * 50n) / 100n)
    expect(user1Balance1 - user1Balance0).to.equal((info0.daoFee * 20n) / 100n)
    expect(user2Balance1 - user2Balance0).to.equal((info0.daoFee * 30n) / 100n)
  })

  afterEach(async () => {
    const contributors = await space.getContributors()
    const shares = contributors.reduce((acc, contributor) => acc + contributor.shares, 0n)
    expect(shares).to.equal(SHARES_SUPPLY)
  })
})

function calculateRewardsPerShareDelta(daoFee: bigint) {
  return (precision.token(1) * daoFee) / SHARES_SUPPLY
}
