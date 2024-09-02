import { Fixture, deployFixture } from '@utils/deployFixture'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Member, Share, Space } from 'types'
import {
  buy,
  createSpace,
  distributeSingleSubscription,
  distributeSubscriptionRewards,
  getTokenAmount,
  getTokenPricePerSecond,
  looseEqual,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MONTH,
  subscribe,
  unsubscribe,
} from './utils'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

describe('Member', function () {
  let f: Fixture
  const planId = 0

  beforeEach(async () => {
    f = await deployFixture()
  })

  describe('Plan', () => {
    it('Check deploy', async () => {
      const { space, spaceAddr, info } = await createSpace(f, f.user0, 'Test')
      const plans = await space.getPlans()
      expect(plans.length).to.equal(1)

      const plan = await space.getPlan(info.planIndex - 1n)
      expect(plan.uri).to.equal('Member')
      expect(plan.price).to.equal(precision.token('0.002048'))
      expect(plan.isActive).to.equal(true)
    })

    it('Create a plan', async () => {
      const { space, spaceAddr, info } = await createSpace(f, f.user0, 'Test')

      // only founder can create plan
      await expect(space.connect(f.deployer).createPlan('New Plan', precision.token(0.1))).to.revertedWith(
        'Only founder',
      )

      const tx = await space.connect(f.user0).createPlan('New Plan', precision.token(0.1))
      await tx.wait()

      const plans = await space.getPlans()
      expect(plans.length).to.equal(2)

      const newPlan = await space.getPlan(1)
      expect(newPlan.uri).to.equal('New Plan')
      expect(newPlan.isActive).to.equal(true)
      expect(newPlan.price).to.equal(precision.token('0.1'))
    })

    it('setPlanURI', async () => {
      const { space, spaceAddr, info } = await createSpace(f, f.user0, 'Test')

      await expect(space.connect(f.user0).setPlanURI(1, 'Updated Plan')).to.revertedWith('Plan is not existed')

      await expect(space.connect(f.deployer).setPlanURI(0, 'Updated Plan')).to.revertedWith('Only founder')

      const tx = await space.connect(f.user0).setPlanURI(0, 'Updated Plan')
      await tx.wait()

      const plan = await space.getPlan(0)
      expect(plan.uri).to.equal('Updated Plan')
    })

    it('setPlanPrice', async () => {
      const { space, spaceAddr, info } = await createSpace(f, f.user0, 'Test')

      await expect(space.connect(f.user0).setPlanPrice(1, 1000n)).to.revertedWith('Plan is not existed')

      await expect(space.connect(f.deployer).setPlanPrice(0, 1000n)).to.revertedWith('Only founder')

      const tx = await space.connect(f.user0).setPlanPrice(0, 1000n)
      await tx.wait()

      const plan = await space.getPlan(0)
      expect(plan.price).to.equal(1000n)
    })

    it('setPlanStatus', async () => {
      const { space, spaceAddr, info } = await createSpace(f, f.user0, 'Test')

      await expect(space.connect(f.user0).setPlanStatus(1, false)).to.revertedWith('Plan is not existed')

      await expect(space.connect(f.deployer).setPlanStatus(0, false)).to.revertedWith('Only founder')

      const tx = await space.connect(f.user0).setPlanStatus(0, false)
      await tx.wait()

      const plan = await space.getPlan(0)
      expect(plan.isActive).to.equal(false)
    })
  })

  it('Calculate tokenPricePerSecond: getTokenPricePerSecond()', async () => {
    const { space } = await createSpace(f, f.user0, 'Test')

    await buy(space, f.user0, precision.token(1))

    const info = await space.getSpaceInfo()
    const price = getTokenPricePerSecond(info.x, info.y, info.k)
    const tokenPricePerSecond = await space.getTokenPricePerSecond(0)
    expect(price).to.equal(tokenPricePerSecond)
  })

  /**
   * Case step:
   * 1. user1 buy 0.002048 token (1 month)
   * 2. user1 subscribe1 month
   */
  it('Subscribe case 1', async () => {
    const { space, spaceAddr } = await createSpace(f, f.user0, 'Test')
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.be.equal(0)

    /** step 1 */
    const buyInfo = await buy(space, f.user1, precision.token('0.002048'))

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.be.equal(buyInfo.creatorFee)

    const user1Balance0 = await space.balanceOf(f.user1.address)

    /** step 2 */
    await subscribe(space, f.user1, user1Balance0)

    // all token is used to pay for subscription
    const user1Balance1 = await space.balanceOf(f.user1.address)
    expect(user1Balance1).to.equal(0)

    // check space balance after subscription
    const spaceBalance2 = await space.balanceOf(spaceAddr)
    expect(spaceBalance2).to.be.equal(user1Balance0 + buyInfo.creatorFee)

    const subscription = await space.getSubscription(planId, f.user1.address)
    const tokenPricePerSecond = await space.getTokenPricePerSecond(0)
    const durationFromAmount = user1Balance0 / tokenPricePerSecond

    expect(subscription.amount).to.be.equal(user1Balance0)
    expect(subscription.duration).to.be.equal(durationFromAmount)

    await checkSubscriptionDuration(space, f.user1, 30)

    const info = await space.getSpaceInfo()
    expect(info.totalFee).to.be.equal(buyInfo.creatorFee)
    expect(info.subscriptionIncome).to.be.equal(0)
  })

  /**
   * Case step:
   * 1. user1 buy 0.002048 token (1 month)
   * 2. user1 subscribe1 month
   * 3. 40 days passed
   * 4. distributeSingleSubscription
   */
  it('Subscribe case 2', async () => {
    const { space, spaceAddr } = await createSpace(f, f.user0, 'Test')
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.be.equal(0)

    /** step 1 */
    const buyInfo = await buy(space, f.user1, precision.token('0.002048'))

    const info0 = await space.getSpaceInfo()
    expect(info0.totalFee).to.be.equal(buyInfo.creatorFee)

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.be.equal(buyInfo.creatorFee)

    const user1Balance0 = await space.balanceOf(f.user1.address)

    const [consumedAmount0, remainDuration0] = await space.calculateConsumedAmount(0, f.user1, await time.latest())
    expect(consumedAmount0).to.be.equal(0)
    expect(remainDuration0).to.be.equal(0)

    /** step 2 */
    await subscribe(space, f.user1, user1Balance0)

    const [consumedAmount1, remainDuration1] = await space.calculateConsumedAmount(0, f.user1, await time.latest())
    expect(consumedAmount1).to.be.equal(0)
    const remainDays = remainDuration1 / SECONDS_PER_DAY
    expect(remainDays).to.equal(30)

    await checkSubscriptionDuration(space, f.user1, 30)

    /** step 3 */
    await time.increase(60 * 60 * 24 * 40) // after 40 days

    const [consumedAmount2, remainDuration2] = await space.calculateConsumedAmount(0, f.user1, await time.latest())
    expect(consumedAmount2).to.be.equal(user1Balance0)
    expect(remainDuration2).to.be.equal(0)

    /** step 4 */
    await distributeSingleSubscription(space, f.user1)

    // check after all is expired
    await checkSubscriptionDuration(space, f.user1, 0)

    const info1 = await space.getSpaceInfo()

    const protocolFee = calProtocolFee(info1.subscriptionIncome)

    expect(info1.subscriptionIncome + protocolFee).to.equal(user1Balance0)
    expect(info1.totalFee).to.equal(info1.subscriptionIncome + info0.totalFee)

    // check space balance after expired
    const user1Balance1 = await space.balanceOf(f.user1.address)
    expect(user1Balance1).to.equal(0)

    const spaceBalance2 = await space.balanceOf(spaceAddr)
    expect(spaceBalance2).to.be.equal(user1Balance0 + buyInfo.creatorFee - protocolFee)
  })

  /**
   * Case step:
   * 1. user1 buy 0.002048 token (1 month)
   * 2. user1 subscribe1 month
   * 3. 40 days passed (expired)
   * 4. user1 buy 0.002048 token (1 month)
   * 5. user1 subscribe1 month
   */
  it('Subscribe case 3', async () => {
    const { space, spaceAddr } = await createSpace(f, f.user0, 'Test')

    /** step 1 */
    const buyInfo0 = await buy(space, f.user1, precision.token('0.002048'))

    const info0 = await space.getSpaceInfo()
    expect(info0.totalFee).to.be.equal(buyInfo0.creatorFee)

    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.be.equal(buyInfo0.creatorFee)

    const user1Balance0 = await space.balanceOf(f.user1.address)

    /** step 2 */
    await subscribe(space, f.user1, user1Balance0)

    await checkSubscriptionDuration(space, f.user1, 30)

    /** step 3 */
    await time.increase(60 * 60 * 24 * 40) // after 40 days

    /** step 4 */
    const buyInfo1 = await buy(space, f.user1, precision.token('0.002048'))

    const info1 = await space.getSpaceInfo()
    expect(info1.totalFee).to.be.equal(info0.totalFee + buyInfo1.creatorFee)

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.be.equal(buyInfo0.tokenAmountAfterFee + buyInfo0.creatorFee + buyInfo1.creatorFee)

    const user1Balance1 = await space.balanceOf(f.user1.address)

    /** step 5 */
    await subscribe(space, f.user1, user1Balance1)

    await checkSubscriptionDuration(space, f.user1, 30)

    const info2 = await space.getSpaceInfo()
    const feeIncome = info2.totalFee - info1.totalFee

    const protocolFee = calProtocolFee(feeIncome)

    const { days: days1 } = await amountToDuration(space, feeIncome + protocolFee)
    const { days: days2 } = await amountToDuration(space, info2.subscriptionIncome + protocolFee)

    expect(days1).to.equal(30)
    expect(days2).to.equal(30)

    expect(info2.subscriptionIncome + protocolFee).to.equal(user1Balance0)
    expect(feeIncome).to.equal(info2.subscriptionIncome)

    // check space balance after expired
    const user1Balance2 = await space.balanceOf(f.user1.address)
    expect(user1Balance2).to.equal(0)

    const spaceBalance2 = await space.balanceOf(spaceAddr)
    expect(spaceBalance2).to.be.equal(
      user1Balance0 + buyInfo0.creatorFee + user1Balance1 + buyInfo1.creatorFee - protocolFee,
    )
  })

  /**
   * case step:
   * 1. user1 buy 0.002048 ETH (one month)
   * 2. user1 subscribe 1 month
   * 3. user1 buy 0.002048 ETH (one month)
   * 4. user1 subscribe 1 month
   */
  it('Subscribe case 4', async () => {
    const { space, spaceAddr, info } = await createSpace(f, f.user0, 'Test')
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.be.equal(0)

    /** step 1 */
    const buyInfo0 = await buy(space, f.user1, precision.token('0.002048'))

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.be.equal(buyInfo0.creatorFee)

    const info0 = await space.getSpaceInfo()
    expect(info0.totalFee).to.be.equal(buyInfo0.creatorFee)

    /** step 2 */
    const user1Balance0 = await space.balanceOf(f.user1.address)
    await subscribe(space, f.user1, user1Balance0)

    // all token is used to pay for subscription
    const user1Balance1 = await space.balanceOf(f.user1.address)
    expect(user1Balance1).to.equal(0)

    const spaceBalance2 = await space.balanceOf(spaceAddr)
    expect(spaceBalance2).to.be.equal(user1Balance0 + buyInfo0.creatorFee)

    const subscription0 = await space.getSubscription(planId, f.user1.address)

    expect(subscription0.planId).to.be.equal(0)
    expect(subscription0.account).to.be.equal(f.user1.address)
    expect(subscription0.startTime).to.be.equal(await time.latest())
    expect(subscription0.startTime).to.be.equal(await time.latest())
    expect(subscription0.amount).to.be.equal(user1Balance0)

    await checkSubscriptionDuration(space, f.user1, 30)

    /** step 3 */
    const buyInfo1 = await buy(space, f.user1, precision.token('0.002048'))

    const info1 = await space.getSpaceInfo()

    /** step 4 */
    const user1Balance2 = await space.balanceOf(f.user1.address)
    await subscribe(space, f.user1, user1Balance2)

    // all token is used to pay for subscription
    const user1Balance3 = await space.balanceOf(f.user1.address)
    expect(user1Balance3).to.equal(0)

    const { subscriptionIncome } = await space.getSpaceInfo()
    const protocolFee1 = calProtocolFee(subscriptionIncome)

    const spaceBalance3 = await space.balanceOf(spaceAddr)
    expect(spaceBalance3).to.be.equal(
      user1Balance0 + buyInfo0.creatorFee + buyInfo1.tokenAmountAfterFee + buyInfo1.creatorFee - protocolFee1,
    )

    const subscription1 = await space.getSubscription(planId, f.user1.address)

    const now = BigInt(await time.latest())
    const timeGap = now - subscription0.startTime
    const consumedAmount = (subscription0.amount * timeGap) / subscription0.duration

    // console.log('>>>>>>>>>gap:', timeGap, 'consumedAmount:', consumedAmount)
    expect(subscription1.startTime).to.be.equal(now)
    expect(subscription1.amount).to.be.equal(user1Balance0 + user1Balance2 - consumedAmount)

    await checkSubscriptionDuration(space, f.user1, 60)

    const info2 = await space.getSpaceInfo()
    const protocolFee2 = calProtocolFee(info2.subscriptionIncome)

    expect(info2.subscriptionIncome + protocolFee2).to.equal(consumedAmount)
    expect(info2.totalFee - info1.totalFee + protocolFee2).to.equal(consumedAmount)
  })

  /**
   * case step:
   * 1. user1 buy 0.002048 ETH (one month)
   * 2. user1 subscribe 1 month
   * 3. after 10 days
   * 4. user1 buy 0.002048 ETH (one month)
   * 5. user1 subscribe 1 month
   */
  it('Subscribe case 5', async () => {
    const { space, spaceAddr } = await createSpace(f, f.user0, 'Test')
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.be.equal(0)

    /** step 1 */
    const buyInfo0 = await buy(space, f.user1, precision.token('0.002048'))

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.be.equal(buyInfo0.creatorFee)

    /** step 2 */
    const user1Balance0 = await space.balanceOf(f.user1.address)
    await subscribe(space, f.user1, user1Balance0)

    // all token is used to pay for subscription
    const user1Balance1 = await space.balanceOf(f.user1.address)
    expect(user1Balance1).to.equal(0)

    const spaceBalance2 = await space.balanceOf(spaceAddr)

    expect(spaceBalance2).to.be.equal(user1Balance0 + buyInfo0.creatorFee)

    const subscription0 = await space.getSubscription(planId, f.user1.address)

    expect(subscription0.amount).to.be.equal(user1Balance0)

    await checkSubscriptionDuration(space, f.user1, 30)

    /** step 3 */
    await time.increase(60 * 60 * 24 * 10) // after 10 days

    /** step 4 */
    const buyInfo1 = await buy(space, f.user1, precision.token('0.002048'))

    const info0 = await space.getSpaceInfo()

    expect(info0.subscriptionIncome).to.equal(0)

    /** step 5 */
    const user1Balance2 = await space.balanceOf(f.user1.address)
    await subscribe(space, f.user1, user1Balance2)

    // check fee
    const info1 = await space.getSpaceInfo()
    const protocolFee = calProtocolFee(info1.subscriptionIncome) - 1n

    const gap = 3
    const consumedAmount = (subscription0.amount * BigInt(60 * 60 * 24 * 10 + gap)) / subscription0.duration

    expect(info1.subscriptionIncome + protocolFee).to.equal(consumedAmount)
    expect(info1.totalFee + protocolFee).to.equal(info0.totalFee + consumedAmount)

    const subscription1 = await space.getSubscription(planId, f.user1.address)
    expect(subscription1.amount).to.be.equal(user1Balance0 + user1Balance2 - consumedAmount)

    // all token is used to pay for subscription
    const user1Balance3 = await space.balanceOf(f.user1.address)
    expect(user1Balance3).to.equal(0)

    // check space balance
    const spaceBalance3 = await space.balanceOf(spaceAddr)

    expect(spaceBalance3).to.be.equal(
      user1Balance0 + buyInfo0.creatorFee + buyInfo1.tokenAmountAfterFee + buyInfo1.creatorFee - protocolFee,
    )

    await checkSubscriptionDuration(space, f.user1, 50)
  })

  /**
   * case step:
   * 1. user1 buy 0.002048 ETH (one month)
   * 2. user1 subscribe 1 month
   * 3. increase 2 days
   * 4. distributeSingleSubscription
   * 5. increase 3 days
   * 6. distributeSingleSubscription
   * 7. increase 5 days
   * 8. distributeSingleSubscription
   * 9. user1 buy 0.002048 ETH (one month)
   * 10. user1 subscribe 1 month
   */
  it('Subscribe case 6', async () => {
    const { space, spaceAddr, info } = await createSpace(f, f.user0, 'Test')
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.be.equal(0)

    /** step 1 */
    const buyInfo0 = await buy(space, f.user1, precision.token('0.002048'))

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.be.equal(buyInfo0.creatorFee)

    /** step 2 */
    const user1Balance0 = await space.balanceOf(f.user1.address)
    await subscribe(space, f.user1, user1Balance0)

    // all token is used to pay for subscription
    const user1Balance1 = await space.balanceOf(f.user1.address)
    expect(user1Balance1).to.equal(0)

    const spaceBalance2 = await space.balanceOf(spaceAddr)

    // TODO:
    expect(spaceBalance2).to.be.equal(user1Balance0 + buyInfo0.creatorFee)

    const subscription0 = await space.getSubscription(planId, f.user1.address)

    expect(subscription0.planId).to.be.equal(0)
    expect(subscription0.account).to.be.equal(f.user1.address)
    expect(subscription0.startTime).to.be.equal(await time.latest())
    expect(subscription0.startTime).to.be.equal(await time.latest())
    expect(subscription0.amount).to.be.equal(user1Balance0)

    {
      const days = subscription0.duration / SECONDS_PER_DAY
      const hours = subscription0.duration / SECONDS_PER_HOUR
      const minutes = subscription0.duration / 60n

      expect(days).to.be.equal(30)
      expect(hours).to.be.equal(30 * 24)
      expect(Math.abs(Number(minutes - BigInt(30 * 24 * 60)))).to.be.lessThan(10)
    }

    await checkSubscriptionDuration(space, f.user1, 30)

    await time.increase(60 * 60 * 24 * 2) // increase 2 days

    await distributeSingleSubscription(space, f.user1)

    await checkSubscriptionDuration(space, f.user1, 28)

    await time.increase(60 * 60 * 24 * 3) // increase 3 days

    await distributeSingleSubscription(space, f.user1)

    await checkSubscriptionDuration(space, f.user1, 25)

    await time.increase(60 * 60 * 24 * 5) // increase 5 days

    await distributeSingleSubscription(space, f.user1)

    await checkSubscriptionDuration(space, f.user1, 20)

    /** step 4 */
    const buyInfo1 = await buy(space, f.user1, precision.token('0.002048'))

    /** step 5 */
    const user1Balance2 = await space.balanceOf(f.user1.address)
    await subscribe(space, f.user1, user1Balance2)

    // all token is used to pay for subscription
    const user1Balance3 = await space.balanceOf(f.user1.address)
    expect(user1Balance3).to.equal(0)

    const spaceBalance3 = await space.balanceOf(spaceAddr)

    const info1 = await space.getSpaceInfo()
    const protocolFee = calProtocolFee(info1.subscriptionIncome) - 1n

    expect(spaceBalance3).to.be.equal(
      user1Balance0 + buyInfo0.creatorFee + buyInfo1.tokenAmountAfterFee + buyInfo1.creatorFee - protocolFee,
    )

    {
      const subscription1 = await space.getSubscription(planId, f.user1.address)

      // expect(subscription1.startTime).to.be.equal(subscription0.startTime)
      // expect(subscription1.amount).to.be.equal(user1Balance0 + user1Balance2)

      await checkSubscriptionDuration(space, f.user1, 50)
    }
  })

  /**
   * Case:
   * 1. user1 buy 0.002048 ETH (one month)
   * 2. user1 subscribe 1 month
   * 3. user4 unsubscribe 1 month (should revert)
   * 4. user1 unsubscribe with zero amount (should revert)
   * 5. user1 unsubscribe with all amount
   */
  it('unsubscribe case 1:subscribe 1 month, then unsubscribe all', async () => {
    const { space, spaceAddr, info } = await createSpace(f, f.user0, 'Test')
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.be.equal(0)

    // step 1
    const buyInfo = await buy(space, f.user1, precision.token('0.002048'))

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.be.equal(buyInfo.creatorFee)

    const user1Balance0 = await space.balanceOf(f.user1.address)

    // step 2
    await subscribe(space, f.user1, user1Balance0)

    // all token is used to pay for subscription
    const user1Balance1 = await space.balanceOf(f.user1.address)
    expect(user1Balance1).to.equal(0)

    const spaceBalance2 = await space.balanceOf(spaceAddr)
    expect(spaceBalance2).to.be.equal(user1Balance0 + buyInfo.creatorFee)

    const subscription0 = await space.getSubscription(planId, f.user1.address)

    const remainAmount0 = await getRemainAmount(subscription0)
    expect(remainAmount0).to.be.equal(subscription0.amount)

    // step 3
    // unsubscribe by wrong user
    await expect(unsubscribe(space, f.user4, remainAmount0)).to.revertedWith('Subscription not found')

    // step 4
    // unsubscribe with zero amount
    await expect(unsubscribe(space, f.user1, 0n)).to.revertedWith('Amount must be greater than zero')

    const subscription1 = await space.getSubscription(planId, f.user1.address)
    const remainAmount1 = await getRemainAmount(subscription1)

    const subscriptions0 = await space.getSubscriptions()
    expect(subscriptions0.length).to.equal(1n)

    // step 5
    // unsubscribe with all amount
    await unsubscribe(space, f.user1, remainAmount1)

    const subscriptions1 = await space.getSubscriptions()
    expect(subscriptions1.length).to.equal(0n)

    const user1Balance2 = await space.balanceOf(f.user1.address)
    expect(user1Balance2).not.to.equal(0)

    const { days } = await amountToDuration(space, user1Balance2)
    expect(days).to.equal(30)
  })

  /**
   * Case:
   * 1. user1 buy 0.002048 ETH (one month)
   * 2. user1 subscribe 1 month
   * 3. user1 unsubscribe with 1/2 amount
   */
  it('unsubscribe case 2', async () => {
    const { space, spaceAddr, info } = await createSpace(f, f.user0, 'Test')
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.be.equal(0)

    // step 1
    const buyInfo = await buy(space, f.user1, precision.token('0.002048'))

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.be.equal(buyInfo.creatorFee)

    const user1Balance0 = await space.balanceOf(f.user1.address)

    // step 2
    await subscribe(space, f.user1, user1Balance0)

    // all token is used to pay for subscription
    const user1Balance1 = await space.balanceOf(f.user1.address)
    expect(user1Balance1).to.equal(0)

    const spaceBalance2 = await space.balanceOf(spaceAddr)
    expect(spaceBalance2).to.be.equal(user1Balance0 + buyInfo.creatorFee)

    const subscription0 = await space.getSubscription(planId, f.user1.address)

    const remainAmount0 = await getRemainAmount(subscription0)
    expect(remainAmount0).to.be.equal(subscription0.amount)

    const halfAmount0 = remainAmount0 / 2n

    // step 3
    // unsubscribe with 1/2 amount
    await unsubscribe(space, f.user1, halfAmount0)

    const user1Balance2 = await space.balanceOf(f.user1.address)
    expect(user1Balance2).to.equal(halfAmount0)

    const { days } = await amountToDuration(space, user1Balance2)
    expect(days).to.equal(15)
  })

  /**
   * Case:
   * 1. user1 buy 0.002048 ETH (one month)
   * 2. user1 subscribe 1 month
   * 3. pass 10 days
   * 4. user1 unsubscribe with 1/2 amount
   */
  it('unsubscribe case 3', async () => {
    const { space, spaceAddr, info } = await createSpace(f, f.user0, 'Test')
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.be.equal(0)

    // step 1
    const buyInfo = await buy(space, f.user1, precision.token('0.002048'))

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.be.equal(buyInfo.creatorFee)

    const user1Balance0 = await space.balanceOf(f.user1.address)

    // step 2
    await subscribe(space, f.user1, user1Balance0)

    // all token is used to pay for subscription
    const user1Balance1 = await space.balanceOf(f.user1.address)
    expect(user1Balance1).to.equal(0)

    const spaceBalance2 = await space.balanceOf(spaceAddr)
    expect(spaceBalance2).to.be.equal(user1Balance0 + buyInfo.creatorFee)

    // step 3
    await time.increase(60 * 60 * 24 * 10) // increase 10 days

    const info0 = await space.getSpaceInfo()
    expect(info0.subscriptionIncome).to.equal(0)

    /** step 4 */
    const subscription1 = await space.getSubscription(planId, f.user1.address)
    const remainAmount1 = await getRemainAmount(subscription1)
    const halfAmount1 = remainAmount1 / 2n
    await unsubscribe(space, f.user1, halfAmount1) // unsubscribe with 1/2 amount

    await checkSubscriptionDuration(space, f.user1, 10)

    const info1 = await space.getSpaceInfo()
    const protocolFee = calProtocolFee(info1.subscriptionIncome)

    expect(info1.subscriptionIncome).to.equal(info1.totalFee - info0.totalFee)

    // check subscription income duration, should be 10 days
    {
      const { days } = await amountToDuration(space, info1.subscriptionIncome + protocolFee)
      expect(days).to.equal(10)
    }

    const user1Balance2 = await space.balanceOf(f.user1.address)

    const { days } = await amountToDuration(space, user1Balance2)
    expect(days).to.equal(10)
  })

  /**
   * case step:
   * 1. user1 subscribe 0.002048 eth (1 month)
   * 2. after 10 days
   * 3. user1 subscribe 0.002048 eth (1 month)
   */
  it('subscribeByEth', async () => {
    const { space, spaceAddr, info } = await createSpace(f, f.user0, 'Test')

    const ethAmount = precision.token('0.002048')

    const tx1 = await space.connect(f.user1).subscribeByEth(planId, {
      value: ethAmount,
    })
    await tx1.wait()

    await checkSubscriptionDuration(space, f.user1, 30)

    const user1Balance = await space.balanceOf(f.user1.address)
    const spaceBalance = await space.balanceOf(spaceAddr)
    const supply = await space.totalSupply()
    const subscriptions = await space.getSubscriptions()
    const subscription = await space.getSubscription(planId, f.user1.address)

    const { tokenAmountAfterFee } = getTokenAmount(info.x, info.y, info.k, ethAmount)
    expect(spaceBalance).to.equal(tokenAmountAfterFee)

    expect(user1Balance).to.equal(0)
    expect(spaceBalance).to.equal(supply)
    expect(subscriptions.length).to.equal(1n)
    expect(subscription.amount).to.equal(spaceBalance)
    expect(info.subscriptionIncome).to.equal(0)

    await time.increase(60 * 60 * 24 * 10) // after 10 days

    const tx2 = await space.connect(f.user1).subscribeByEth(planId, {
      value: ethAmount,
    })
    await tx2.wait()

    const info1 = await space.getSpaceInfo()

    const protocolFee = calProtocolFee(info1.subscriptionIncome)
    const { days } = await amountToDuration(space, info1.subscriptionIncome + protocolFee)

    expect(days).to.equal(10)

    await checkSubscriptionDuration(space, f.user1, 50)
  })

  /**
   * Case step:
   * 1. user1 buy 0.002048 token (1 month)
   * 2. user1 subscribe1 month
   * 3. user2 buy 0.002048 token (1 month)
   * 4. user2 subscribe1 month
   * 5. increase 10 days
   * 6. distributeSubscriptionRewards for user 1 and user 2
   */
  it('distributeSubscriptionRewards', async () => {
    const { space, spaceAddr } = await createSpace(f, f.user0, 'Test')
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.be.equal(0)

    /** step 1 */
    const buyInfo1 = await buy(space, f.user1, precision.token('0.002048'))

    const info0 = await space.getSpaceInfo()
    expect(info0.totalFee).to.be.equal(buyInfo1.creatorFee)

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.be.equal(buyInfo1.creatorFee)

    const user1Balance0 = await space.balanceOf(f.user1.address)

    /** step 2 */
    await subscribe(space, f.user1, user1Balance0)

    await checkSubscriptionDuration(space, f.user1, 30)

    /** step 3 */
    const buyInfo2 = await buy(space, f.user2, precision.token('0.002048'))

    const user2Balance0 = await space.balanceOf(f.user2.address)

    /** step 4 */
    await subscribe(space, f.user2, user2Balance0)

    await checkSubscriptionDuration(space, f.user2, 30)

    /** step 5 */
    await time.increase(60 * 60 * 24 * 10) // after 10 days

    const info1 = await space.getSpaceInfo()
    const spaceBalance = await space.balanceOf(spaceAddr)

    expect(spaceBalance).to.equal(buyInfo1.creatorFee + buyInfo2.creatorFee + user1Balance0 + user2Balance0)

    expect(info1.subscriptionIncome).to.equal(0)

    /** step 6 */
    await distributeSubscriptionRewards(space)

    const info2 = await space.getSpaceInfo()
    const protocolFee = calProtocolFee(info2.subscriptionIncome)

    const subscriptionIncome = info2.subscriptionIncome - info1.subscriptionIncome
    expect(info2.totalFee - info1.totalFee).to.equal(subscriptionIncome)

    // the subscriptionIncome should be 20 days
    const tokenPricePerSecond = await space.getTokenPricePerSecond(0)
    const durationFromAmount = (subscriptionIncome + protocolFee) / tokenPricePerSecond
    expect(durationFromAmount / SECONDS_PER_DAY).to.equal(20)
  })
})

export type SubscriptionStructOutput = {
  planId: bigint
  account: string
  startTime: bigint
  duration: bigint
  amount: bigint
}

async function getRemainDuration(subscription: SubscriptionStructOutput) {
  const remain = subscription.startTime + subscription.duration - BigInt(await time.latest())
  return remain >= 0n ? remain : BigInt(0)
}

async function getRemainAmount(subscription: SubscriptionStructOutput) {
  const remainDuration = await getRemainDuration(subscription)
  return (subscription.amount * remainDuration) / subscription.duration
}

async function checkSubscriptionDuration(space: Space, account: HardhatEthersSigner, durationDays: number) {
  const subscription = await space.getSubscription(0, account.address)

  // expect(subscription1.amount).to.be.equal(user1Balance0 + user1Balance2)

  const now = BigInt(await time.latest())
  expect(subscription.planId).to.be.equal(0)
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

async function amountToDuration(space: Space, amount: bigint) {
  const tokenPricePerSecond = await space.getTokenPricePerSecond(0)
  const durationFromAmount = amount / tokenPricePerSecond
  const days = durationFromAmount / SECONDS_PER_DAY
  return { days }
}

function calProtocolFee(income: bigint) {
  const subscriptionFeePercent = precision.token('0.05')
  const protocolFee = (income * subscriptionFeePercent) / (precision.token(1) - subscriptionFeePercent)
  return protocolFee
}
