import { Fixture, deployFixture } from '@utils/deployFixture'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { Space } from 'types'
import {
  createSpace,
  subscribeByEth,
  createCode,
  bindCode,
  SECONDS_PER_MONTH,
  distributeSubscriptionRewards,
  distributeSingleSubscription,
  buy,
  getSubscription,
  updateTier,
  looseEqual,
} from './utils'

import { subscribeForMonths } from './utils/subscribeUtil'

import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

describe('Curation rewards', function () {
  let f: Fixture

  let space: Space
  let spaceAddr: string
  let premint = BigInt(0)
  let spaceOwner: HardhatEthersSigner

  let defaultPlanPrice = precision.token('0.002048')

  beforeEach(async () => {
    f = await deployFixture()
    const spaceName = 'Test Space'
    const res = await createSpace(f, f.user0, spaceName)
    space = res.space
    spaceOwner = f.user0
    spaceAddr = res.spaceAddr
    premint = res.premint

    await updateTier(space, f.user0, 0n, 2n, precision.token(0.1))
    await updateTier(space, f.user0, 1n, 4n, precision.token(0.2))
    await updateTier(space, f.user0, 2n, 6n, precision.token(0.4))

    const tier3 = await space.getTier(2)
    expect(tier3.memberCountBreakpoint).to.equal(6n)
    expect(tier3.rebateRate).to.equal(precision.token(0.4))
  })

  describe('Curation tier1 rewards, subscription 2 years', () => {
    beforeEach(async () => {
      const code = '12345'

      // user1 creates a code
      await createCode(space, f.user1, code)

      // user1 invite user2
      await bindCode(space, f.user2, code)

      // user2 subscribe by eth 2 years
      await buy(space, f.user2, precision.token(1))
      await subscribeForMonths(space, f.user2, 24, 0)
    })

    it('1 year passed', async () => {
      const subscription0 = await getSubscription(space, 0, f.user2.address)

      const nextTimestamp = BigInt(await time.latest()) + SECONDS_PER_MONTH * 12n

      const user1Balance0 = await space.balanceOf(f.user1.address)
      const factoryBalance0 = await space.balanceOf(f.spaceFactoryAddr)
      const spaceBalance0 = await space.balanceOf(spaceAddr)

      //  year passed, user1 gets 10% of tier1 rewards
      await time.setNextBlockTimestamp(nextTimestamp)

      await distributeSingleSubscription(space, f.user2)

      const subscription1 = await getSubscription(space, 0, f.user2.address)

      const income = subscription0.amount - subscription1.amount

      const { rewards, protocolFee, appFee, creatorIncome } = calFee(income)
      expect(income).to.equal(rewards + protocolFee + appFee + creatorIncome)

      expect(subscription1.startTime).to.equal(nextTimestamp)

      const curationUser1 = await space.getCurationUser(f.user1)
      expect(curationUser1.rewards).to.equal(rewards)
      expect(curationUser1.memberCount).to.equal(1n)

      await expect(space.connect(f.user1).claimCurationRewards())
        .to.emit(space, 'CurationRewardsClaimed')
        .withArgs(f.user1.address, rewards)

      const user1Balance1 = await space.balanceOf(f.user1.address)
      const factoryBalance1 = await space.balanceOf(f.spaceFactoryAddr)
      const spaceBalance1 = await space.balanceOf(spaceAddr)

      expect(user1Balance1 - user1Balance0).to.equal(rewards)
      expect(factoryBalance1 - factoryBalance0).to.equal(protocolFee + appFee)
      expect(spaceBalance1).to.equal(spaceBalance0 - rewards - protocolFee - appFee)

      const curationUser2 = await space.getCurationUser(f.user1)
      expect(curationUser2.rewards).to.equal(0)
    })

    it('2 year passed', async () => {
      const subscription0 = await getSubscription(space, 0, f.user2.address)

      const user1Balance0 = await space.balanceOf(f.user1.address)
      const factoryBalance0 = await space.balanceOf(f.spaceFactoryAddr)
      const spaceBalance0 = await space.balanceOf(spaceAddr)

      const nextTimestamp = BigInt(await time.latest()) + SECONDS_PER_MONTH * 24n

      //  year passed, user1 gets 10% of tier1 rewards
      await time.setNextBlockTimestamp(nextTimestamp)

      await distributeSingleSubscription(space, f.user2)
      // await distributeSingleSubscription(space, f.user1)

      const subscriptions = await space.getSubscriptions()
      expect(subscriptions.length).to.equal(0)

      // all subscriptions are expired, all amounts is income
      const income = subscription0.amount

      const { rewards, protocolFee, appFee, creatorIncome } = calFee(income)
      expect(income).to.equal(rewards + protocolFee + appFee + creatorIncome)

      const curationUser1 = await space.getCurationUser(f.user1)
      expect(curationUser1.rewards).to.equal(rewards)

      await expect(space.connect(f.user1).claimCurationRewards())
        .to.emit(space, 'CurationRewardsClaimed')
        .withArgs(f.user1.address, rewards)

      const user1Balance1 = await space.balanceOf(f.user1.address)
      const factoryBalance1 = await space.balanceOf(f.spaceFactoryAddr)
      const spaceBalance1 = await space.balanceOf(spaceAddr)

      expect(user1Balance1 - user1Balance0).to.equal(rewards)
      expect(factoryBalance1 - factoryBalance0).to.equal(protocolFee + appFee)
      expect(spaceBalance1).to.equal(spaceBalance0 - rewards - protocolFee - appFee)

      const curationUser2 = await space.getCurationUser(f.user1)
      expect(curationUser2.rewards).to.equal(0)
    })
  })

  describe('Curation tier2 rewards, subscription 2 years', () => {
    beforeEach(async () => {
      const code = '12345'

      // user1 creates a code
      await createCode(space, f.user1, code)

      /** user1 invite 4 users */
      const accounts = [f.user2, f.user3, f.user4, f.user5]

      for (const account of accounts) {
        await bindCode(space, account, code)
        await subscribeByEth(space, account, defaultPlanPrice * 24n)
      }

      const user0 = await space.getCurationUser(f.user1.address)
      expect(user0.memberCount).to.equal(4n)

      for (const account of accounts) {
        const user = await space.getCurationUser(account.address)
        expect(user.memberCount).to.equal(0)
        expect(user.curator).to.equal(f.user1.address)
      }
    })

    it('1 year passed', async () => {
      const accounts = [f.user2, f.user3, f.user4, f.user5]
      let amount0 = 0n
      for (const account of accounts) {
        const subscription = await getSubscription(space, 0, account.address)
        amount0 += subscription.amount
      }

      const subscriptions0 = await space.getSubscriptions()
      expect(subscriptions0.length).to.equal(4)

      const user1Balance0 = await space.balanceOf(f.user1.address)

      const factoryBalance0 = await space.balanceOf(f.spaceFactoryAddr)
      const spaceBalance0 = await space.balanceOf(spaceAddr)

      const nextTimestamp = BigInt(await time.latest()) + SECONDS_PER_MONTH * 12n

      await time.setNextBlockTimestamp(nextTimestamp)

      await distributeSubscriptionRewards(space)

      let amount1 = 0n
      for (const account of accounts) {
        const subscription = await getSubscription(space, 0, account.address)
        amount1 += subscription.amount
      }

      const income = amount0 - amount1

      // calculate fee with tier 2
      const { rewards, protocolFee, appFee, creatorIncome } = calFee(income, 1)
      expect(income).to.equal(rewards + protocolFee + appFee + creatorIncome)

      const curationUser1 = await space.getCurationUser(f.user1)
      expect(curationUser1.rewards).to.equal(rewards)
      expect(curationUser1.memberCount).to.equal(4n)

      await expect(space.connect(f.user1).claimCurationRewards())
        .to.emit(space, 'CurationRewardsClaimed')
        .withArgs(f.user1.address, rewards)

      const subscriptions1 = await space.getSubscriptions()
      expect(subscriptions1.length).to.equal(4n)

      const user1Balance1 = await space.balanceOf(f.user1.address)
      const factoryBalance1 = await space.balanceOf(f.spaceFactoryAddr)
      const spaceBalance1 = await space.balanceOf(spaceAddr)

      expect(user1Balance1 - user1Balance0).to.equal(rewards)
      looseEqual(factoryBalance1 - factoryBalance0, protocolFee + appFee)
      looseEqual(spaceBalance1, spaceBalance0 - rewards - protocolFee - appFee)

      const curationUser2 = await space.getCurationUser(f.user1)
      expect(curationUser2.rewards).to.equal(0)
    })
  })

  describe('Curation tier3 rewards, subscription 2 years', () => {
    beforeEach(async () => {
      const code = '12345'

      // user1 creates a code
      await createCode(space, f.user1, code)

      /** user1 invite 6 users */
      const accounts = [f.user2, f.user3, f.user4, f.user5, f.user6, f.user7]

      for (const account of accounts) {
        await bindCode(space, account, code)
        await subscribeByEth(space, account, defaultPlanPrice * 24n)
      }

      const user0 = await space.getCurationUser(f.user1.address)
      expect(user0.memberCount).to.equal(6n)

      for (const account of accounts) {
        const user = await space.getCurationUser(account.address)
        expect(user.memberCount).to.equal(0)
        expect(user.curator).to.equal(f.user1.address)
      }
    })

    it('1 year passed', async () => {
      const accounts = [f.user2, f.user3, f.user4, f.user5, f.user6, f.user7]

      let amount0 = 0n
      for (const account of accounts) {
        const subscription = await getSubscription(space, 0, account.address)
        amount0 += subscription.amount
      }

      const subscriptions0 = await space.getSubscriptions()
      expect(subscriptions0.length).to.equal(6)

      const user1Balance0 = await space.balanceOf(f.user1.address)

      const factoryBalance0 = await space.balanceOf(f.spaceFactoryAddr)
      const spaceBalance0 = await space.balanceOf(spaceAddr)

      const nextTimestamp = BigInt(await time.latest()) + SECONDS_PER_MONTH * 12n

      await time.setNextBlockTimestamp(nextTimestamp)

      await distributeSubscriptionRewards(space)

      let amount1 = 0n
      for (const account of accounts) {
        const subscription = await getSubscription(space, 0, account.address)
        amount1 += subscription.amount
      }

      const income = amount0 - amount1

      // calculate fee with tier 2
      const { rewards, protocolFee, appFee, creatorIncome } = calFee(income, 2)
      expect(income).to.equal(rewards + protocolFee + appFee + creatorIncome)

      const curationUser1 = await space.getCurationUser(f.user1)
      looseEqual(curationUser1.rewards, rewards)
      expect(curationUser1.memberCount).to.equal(6)

      const tx = await space.connect(f.user1).claimCurationRewards()
      await tx.wait()

      const subscriptions1 = await space.getSubscriptions()
      expect(subscriptions1.length).to.equal(6n)

      const user1Balance1 = await space.balanceOf(f.user1.address)
      const factoryBalance1 = await space.balanceOf(f.spaceFactoryAddr)
      const spaceBalance1 = await space.balanceOf(spaceAddr)

      looseEqual(user1Balance1 - user1Balance0, rewards)
      looseEqual(factoryBalance1 - factoryBalance0, protocolFee + appFee)
      looseEqual(spaceBalance1, spaceBalance0 - rewards - protocolFee - appFee)

      const curationUser2 = await space.getCurationUser(f.user1)
      expect(curationUser2.rewards).to.equal(0)
    })
  })
})

function calFee(income: bigint, tier = 0) {
  const rebateRates = [10n, 20n, 40n] // 10%, 20%, 40%

  const appFee = (income * 3n) / 100n // 3%
  const protocolFee = (income * 2n) / 100n // 2%
  const fee = appFee + protocolFee
  const incomeAfterFee = income - fee
  const rewards = (incomeAfterFee * rebateRates[tier]) / 100n
  const creatorIncome = incomeAfterFee - rewards

  return {
    appFee,
    protocolFee,
    creatorIncome,
    rewards,
  }
}
