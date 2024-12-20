import { Fixture, deployFixture } from '@utils/deployFixture'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { Space } from 'types'
import {
  SECONDS_PER_HOUR,
  SECONDS_PER_DAY,
  createSpace,
  calculateSubscriptionConsumed,
  getPlan,
  getTokenAmount,
  getSpaceInfo,
  SECONDS_PER_MONTH,
  getEthAmountWithoutFee,
  getTokenPricePerSecondWithMonthlyPrice,
  checkSubscriptionDuration,
  getTokenAmountWithoutFee,
  buy,
  subscribeByEth,
  subscribe,
} from './utils'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { describe } from 'mocha'
import { ethers } from 'hardhat'

describe('Member', function () {
  let f: Fixture

  let space: Space
  let spaceAddr: string
  let premint = BigInt(0)
  let spaceOwner: HardhatEthersSigner

  const firstPlanId = 0
  let defaultPlanId = firstPlanId
  let defaultPlanName = ''
  let defaultPlanPrice = precision.token('0.002048')

  let testPlanId = 1
  let testPlanName = 'Test Plan'
  let testPlanPrice = precision.token('0.002048') * 2n
  let testPlanMinEthAmount = precision.token('0.0001')

  beforeEach(async () => {
    f = await deployFixture()
    const spaceName = 'Test Space'
    const res = await createSpace(f, f.user0, spaceName)
    space = res.space
    spaceOwner = f.user0
    spaceAddr = res.spaceAddr
    premint = res.premint
  })

  describe('Plan', () => {
    it('check default plan', async () => {
      const plans = await space.getPlans()
      expect(plans.length).to.equal(1)

      const plan = await getPlan(space, defaultPlanId)
      expect(plan.uri).to.equal(defaultPlanName)
      expect(plan.price).to.equal(defaultPlanPrice)
      expect(plan.isActive).to.equal(true)
    })

    it('should create a new plan', async () => {
      await expect(
        space.connect(f.deployer).createPlan('New Plan', precision.token(0.1), precision.token(0)),
      ).to.revertedWithCustomError(space, 'OwnableUnauthorizedAccount')

      await expect(space.connect(spaceOwner).createPlan('New Plan', 0, 0)).to.revertedWithCustomError(
        f.member,
        'PriceIsZero',
      )

      await expect(space.connect(spaceOwner).createPlan(testPlanName, testPlanPrice, testPlanMinEthAmount))
        .to.emit(space, 'PlanCreated')
        .withArgs(testPlanId, testPlanName, testPlanPrice, testPlanMinEthAmount)

      const plans = await space.getPlans()
      expect(plans.length).to.equal(2) // Including the initial plan
      expect(plans[testPlanId].uri).to.equal(testPlanName)
      expect(plans[testPlanId].price).to.equal(testPlanPrice)
      expect(plans[testPlanId].minEthAmount).to.equal(testPlanMinEthAmount)
      expect(plans[testPlanId].isActive).to.equal(true)

      const info = await getSpaceInfo(space)
      expect(info.planIndex).to.equal(testPlanId + 1)
    })

    it('should update an existing plan', async () => {
      await expect(
        space.connect(spaceOwner).updatePlan(firstPlanId, testPlanName, testPlanPrice, testPlanMinEthAmount, false),
      )
        .to.emit(space, 'PlanUpdated')
        .withArgs(firstPlanId, testPlanName, testPlanPrice, testPlanMinEthAmount)

      const updatedPlan = await getPlan(space, firstPlanId)
      expect(updatedPlan.uri).to.equal(testPlanName)
      expect(updatedPlan.price).to.equal(testPlanPrice)
      expect(updatedPlan.minEthAmount).to.equal(testPlanMinEthAmount)
      expect(updatedPlan.isActive).to.equal(false)
    })

    it('should revert when updating invalid plan', async () => {
      await expect(
        space.connect(f.deployer).updatePlan(0, '', testPlanPrice, testPlanMinEthAmount, true),
      ).to.revertedWithCustomError(space, 'OwnableUnauthorizedAccount')

      await expect(
        space.connect(spaceOwner).updatePlan(0, '', 0, testPlanMinEthAmount, true),
      ).to.revertedWithCustomError(f.member, 'PriceIsZero')

      await expect(
        space.connect(spaceOwner).updatePlan(99, 'Non-existent Plan', testPlanPrice, testPlanMinEthAmount, true),
      ).to.be.revertedWithCustomError(f.member, 'PlanNotExisted')
    })
  })

  describe('Eth Subscription', () => {
    it('Check subscription storage state', async () => {
      const initialPlans = await space.getPlans()
      expect(initialPlans.length).to.equal(1)

      await expect(space.subscribeByEth(0, '', { value: 0 })).to.revertedWithCustomError(space, 'EthAmountIsZero')

      const ethAmount = precision.token('0.01')

      const info = await getSpaceInfo(space)
      const { tokenAmountAfterFee } = getTokenAmount(info.x, info.y, info.k, ethAmount)

      await expect(space.connect(f.user1).subscribeByEth(firstPlanId, '', { value: ethAmount }))
        .to.emit(space, 'Subscribed')
        .withArgs(
          firstPlanId,
          true,
          f.user1.address,
          tokenAmountAfterFee,
          (increasingDuration: bigint) => increasingDuration > 0n,
          (remainingDuration: bigint) => remainingDuration > 0n,
          '',
        )

      const subscriptions = await space.getSubscriptions()
      const subscription = subscriptions[firstPlanId]
      expect(subscriptions.length).to.equal(1)
      expect(subscription.planId).to.equal(firstPlanId)
      expect(subscription.account).to.equal(f.user1.address)
      expect(subscription.amount).to.be.greaterThan(0)
    })

    it('Check funds state (subscribeByEth)', async () => {
      const ethAmount = precision.token('0.01')

      const { x, y, k } = await getSpaceInfo(space)
      const { tokenAmountAfterFee } = getTokenAmount(x, y, k, ethAmount)

      const user1EthBalance0 = await ethers.provider.getBalance(f.user1.address)
      const spaceEthBalance0 = await ethers.provider.getBalance(spaceAddr)
      const spaceBalance0 = await space.balanceOf(spaceAddr)
      const { gasCost } = await subscribeByEth(space, f.user1, ethAmount)

      // check eth
      const user1EthBalance1 = await ethers.provider.getBalance(f.user1.address)
      const spaceEthBalance1 = await ethers.provider.getBalance(spaceAddr)
      expect(user1EthBalance0 - user1EthBalance1).to.equal(ethAmount + gasCost)
      expect(spaceEthBalance1 - spaceEthBalance0).to.equal(ethAmount)

      // check token
      const userBalance1 = await space.balanceOf(f.user1.address)
      const spaceBalance1 = await space.balanceOf(spaceAddr)
      expect(userBalance1).to.equal(0)
      expect(spaceBalance1 - spaceBalance0).to.equal(tokenAmountAfterFee)
    })

    it('should fail if the plan does not exist', async () => {
      const nonExistentPlanId = 254

      const ethAmount = precision.token('0.01')
      await expect(
        space.connect(f.user1).subscribeByEth(nonExistentPlanId, '', { value: ethAmount }),
      ).to.be.revertedWithCustomError(f.member, 'PlanNotExisted')
    })

    it('should fail if the ETH amount is less than the minimum required', async () => {
      await space.connect(spaceOwner).createPlan(testPlanName, testPlanPrice, testPlanMinEthAmount)

      const insufficientEthAmount = testPlanMinEthAmount - precision.token('0.00001') // Less than the plan's minimum
      await expect(
        space.connect(f.user1).subscribeByEth(testPlanId, '', { value: insufficientEthAmount }),
      ).to.be.revertedWithCustomError(f.member, 'SubscribeAmountTooSmall')
    })

    it('should allow a user to subscribe multiple times', async () => {
      const initialPlans = await space.getPlans()
      expect(initialPlans.length).to.be.greaterThan(0)

      const ethAmount = precision.token('0.002048')

      // First subscription
      await space.connect(f.user1).subscribeByEth(firstPlanId, '', { value: ethAmount })
      const subscriptions1 = await space.getSubscriptions()
      expect(subscriptions1.length).to.equal(1)
      expect(subscriptions1[0].planId).to.equal(firstPlanId)
      expect(subscriptions1[0].account).to.equal(f.user1.address)
      expect(subscriptions1[0].amount).to.be.greaterThan(0)

      // Second subscription
      await space.connect(f.user1).subscribeByEth(firstPlanId, '', { value: ethAmount })
      const subscriptions2 = await space.getSubscriptions()
      expect(subscriptions2.length).to.equal(1)
      expect(subscriptions2[0].planId).to.equal(firstPlanId)
      expect(subscriptions2[0].account).to.equal(f.user1.address)
      expect(subscriptions2[0].amount).to.be.greaterThanOrEqual(subscriptions1[0].amount)
      expect(subscriptions2[0].amount).to.be.lessThanOrEqual(subscriptions1[0].amount * 2n)

      // Third subscription after time lapse
      await time.setNextBlockTimestamp(BigInt(await time.latest()) + SECONDS_PER_DAY * 100n)
      await space.connect(f.user1).subscribeByEth(firstPlanId, '', { value: ethAmount })
      const subscriptions3 = await space.getSubscriptions()

      expect(subscriptions3.length).to.equal(0)
      // expect(subscriptions3[0].planId).to.equal(firstPlanId)
      // expect(subscriptions3[0].account).to.equal(f.user1.address)
      // expect(subscriptions3[0].amount).to.be.lessThanOrEqual(subscriptions1[0].amount)
    })

    it('should calculate subscription duration correctly based on ETH amount', async () => {
      // except
      const info = await getSpaceInfo(space)
      const {
        newX,
        newY,
        newK,
        tokenAmountAfterFee: exceptTokenAmount,
      } = getTokenAmount(info.x, info.y, info.k, testPlanPrice)
      const exceptTokenAmountPerSeconds = getTokenPricePerSecondWithMonthlyPrice(newX, newY, newK, testPlanPrice)
      const exceptDurations = exceptTokenAmount / exceptTokenAmountPerSeconds

      await space.connect(spaceOwner).createPlan(testPlanName, testPlanPrice, testPlanMinEthAmount)

      const ethAmount = testPlanPrice

      await space.connect(f.user1).subscribeByEth(testPlanId, '', { value: ethAmount })
      const subscriptions = await space.getSubscriptions()

      expect(subscriptions.length).to.equal(1)
      expect(subscriptions[0].planId).to.equal(testPlanId)
      expect(subscriptions[0].account).to.equal(f.user1.address)
      expect(subscriptions[0].amount).to.be.greaterThan(0)
      expect(subscriptions[0].duration).to.be.eq(exceptDurations)
      await checkSubscriptionDuration(space, f.user1, 30, testPlanId)
    })
  })

  describe('Token Subscription', () => {
    it('should allow subscription using tokens', async () => {
      const info = await getSpaceInfo(space)
      const {
        newX,
        newY,
        newK,
        tokenAmountAfterFee: exceptTokenAmount,
      } = getTokenAmount(info.x, info.y, info.k, testPlanPrice)
      const exceptTokenAmountPerSeconds = getTokenPricePerSecondWithMonthlyPrice(newX, newY, newK, testPlanPrice)
      const exceptDurations = exceptTokenAmount / exceptTokenAmountPerSeconds

      // Create plan and buy tokens
      await space.connect(spaceOwner).createPlan(testPlanName, testPlanPrice, testPlanMinEthAmount)
      await space.connect(f.user1).buy(0, { value: testPlanPrice })

      const balanceOfToken = await space.balanceOf(f.user1.address)

      // Approve and subscribe
      await space.connect(f.user1).approve(space, balanceOfToken)
      await expect(space.connect(f.user1).subscribe(testPlanId, balanceOfToken, ''))
        .to.emit(space, 'Subscribed')
        .withArgs(
          testPlanId,
          false,
          f.user1.address,
          balanceOfToken,
          (increasingDuration: bigint) => increasingDuration > 0n,
          (remainingDuration: bigint) => remainingDuration > 0,
          '',
        )

      // Verify subscription details
      const subscriptions = await space.getSubscriptions()
      expect(subscriptions.length).to.equal(1)
      expect(subscriptions[0].planId).to.equal(testPlanId)
      expect(subscriptions[0].account).to.equal(f.user1.address)
      expect(subscriptions[0].amount).to.be.greaterThan(0)
      expect(subscriptions[0].duration).to.be.greaterThan(0)

      // Verify expected duration
      expect(subscriptions[0].amount).to.be.eq(exceptTokenAmount)
      expect(subscriptions[0].duration).to.be.eq(exceptDurations)
    })

    it('should revert if token amount is zero', async () => {
      await expect(space.connect(f.user1).subscribe(firstPlanId, 0, '')).to.be.revertedWithCustomError(
        f.member,
        'AmountIsZero',
      )
    })

    it('should fail if the plan does not exist', async () => {
      const nonExistentPlanId = 254
      const tokenAmount = precision.token('1')
      await space.connect(f.user1).buy(0, { value: testPlanPrice })
      const balanceOfToken = await space.balanceOf(f.user1.address)
      await space.connect(f.user1).approve(space, balanceOfToken)

      await expect(space.connect(f.user1).subscribe(nonExistentPlanId, tokenAmount, '')).to.be.revertedWithCustomError(
        f.member,
        'PlanNotExisted',
      )
    })

    it('should fail if tokens are not approved for transfer', async () => {
      const tokenAmount = precision.token('1')

      await expect(space.connect(f.user1).subscribe(firstPlanId, tokenAmount, '')).to.be.revertedWithCustomError(
        space,
        'ERC20InsufficientAllowance',
      )
    })

    it('should fail if user has insufficient token balance', async () => {
      const tokenAmount = precision.token('1')
      await space.connect(f.user1).approve(space, tokenAmount)

      await expect(space.connect(f.user1).subscribe(firstPlanId, tokenAmount, '')).to.be.revertedWithCustomError(
        space,
        'ERC20InsufficientBalance',
      )
    })
  })

  describe('Unsubscribe', () => {
    it('should allow a user to completely unsubscribe from a plan', async () => {
      const ethAmount = precision.token('0.01')
      await space.connect(f.user1).subscribeByEth(firstPlanId, '', { value: ethAmount })

      const initialSubscriptions = await space.getSubscriptions()
      expect(initialSubscriptions.length).to.equal(1)

      const subscribedAmount = initialSubscriptions[0].amount
      await space.connect(f.user1).unsubscribe(firstPlanId, subscribedAmount + 1n)

      const finalSubscriptions = await space.getSubscriptions()
      expect(finalSubscriptions.length).to.equal(0)
    })

    it('should allow a user to partially unsubscribe after two hours', async () => {
      await testPartialUnsubscribeAfterTimePassed(SECONDS_PER_HOUR * 2n)
    })

    it('should allow a user to partially unsubscribe after one day', async () => {
      await testPartialUnsubscribeAfterTimePassed(SECONDS_PER_HOUR * 24n)
    })

    it('should allow a user to partially unsubscribe after two days', async () => {
      await testPartialUnsubscribeAfterTimePassed(SECONDS_PER_HOUR * 48n)
    })

    it('should fail to unsubscribe with amount zero', async () => {
      const ethAmount = precision.token('0.01')
      await space.connect(f.user1).subscribeByEth(firstPlanId, '', { value: ethAmount })

      await expect(space.connect(f.user1).unsubscribe(firstPlanId, 0)).to.be.revertedWithCustomError(
        f.member,
        'AmountIsZero',
      )
    })

    // Helper function for testing partial unsubscribe after time has passed
    async function testPartialUnsubscribeAfterTimePassed(timeElapsed: bigint) {
      const subscriptionAmount = precision.token('0.02')
      await space.connect(f.user1).subscribeByEth(firstPlanId, '', { value: subscriptionAmount })

      const subscriptionsBeforeUnsubscribe = await space.getSubscriptions()
      const activeSubscription = subscriptionsBeforeUnsubscribe[0]
      const partialUnsubscribeAmount = activeSubscription.amount / 2n

      const nextBlockTimestamp = BigInt(await time.latest()) + timeElapsed
      await time.setNextBlockTimestamp(nextBlockTimestamp)
      await space.connect(f.user1).unsubscribe(firstPlanId, partialUnsubscribeAmount)

      const subscriptionsAfterUnsubscribe = await space.getSubscriptions()
      const updatedSubscription = subscriptionsAfterUnsubscribe[0]
      const consumptionInfo = calculateSubscriptionConsumed(
        activeSubscription.startTime,
        activeSubscription.duration,
        activeSubscription.amount,
        BigInt(nextBlockTimestamp),
      )
      const calculatedUnsubscribedDuration =
        (activeSubscription.duration * partialUnsubscribeAmount) / activeSubscription.amount

      expect(updatedSubscription.amount).to.be.lessThan(activeSubscription.amount)
      expect(updatedSubscription.amount).to.equal(
        activeSubscription.amount - partialUnsubscribeAmount - consumptionInfo.consumedAmount,
      )
      expect(updatedSubscription.duration).to.closeTo(
        consumptionInfo.remainingDuration - calculatedUnsubscribedDuration,
        1n,
      )
    }
  })

  describe('Complex Subscribe and Unsubscribe Scenarios', () => {
    let initTokenAmount = 0n
    const testPlanId = firstPlanId + 1

    beforeEach(async () => {
      await space.connect(spaceOwner).createPlan(testPlanName, testPlanPrice, testPlanMinEthAmount)

      await space.connect(f.user1).buy(0, { value: testPlanPrice })
      await space.connect(f.user2).buy(0, { value: testPlanPrice })
      await space.connect(f.user3).buy(0, { value: testPlanPrice })

      initTokenAmount = await space.balanceOf(f.user1.address)

      await space.connect(f.user1).approve(space, initTokenAmount)
      await space.connect(f.user2).approve(space, initTokenAmount)
      await space.connect(f.user3).approve(space, initTokenAmount)
    })

    it('should allow multiple users to subscribe and unsubscribe independently with tokens', async () => {
      const halfTokenAmount = initTokenAmount / 2n

      await space.connect(f.user1).subscribe(testPlanId, halfTokenAmount, '')
      await space.connect(f.user2).subscribe(testPlanId, halfTokenAmount, '')

      const subscriptionsBeforeUnsubscribe = await space.getSubscriptions()

      expect(subscriptionsBeforeUnsubscribe.length).to.equal(2)

      await space.connect(f.user1).unsubscribe(testPlanId, halfTokenAmount)
      await space.connect(f.user2).unsubscribe(testPlanId, halfTokenAmount)

      const subscriptionsAfterUnsubscribe = await space.getSubscriptions()

      expect(subscriptionsAfterUnsubscribe.length).to.equal(0)
    })

    it('should allow quick consecutive unsubscribes with tokens', async () => {
      const halfTokenAmount = initTokenAmount / 2n
      await space.connect(f.user1).subscribe(testPlanId, halfTokenAmount, '')

      const subscriptionsBeforeUnsubscribe = await space.getSubscriptions()
      const subscribedAmount = subscriptionsBeforeUnsubscribe[0].amount

      await space.connect(f.user1).unsubscribe(testPlanId, subscribedAmount / 2n)
      await space.connect(f.user1).unsubscribe(testPlanId, subscribedAmount / 2n)

      const subscriptionsAfterUnsubscribe = await space.getSubscriptions()
      expect(subscriptionsAfterUnsubscribe.length).to.equal(0)
    })

    it('should allow a user to partially unsubscribe and then resubscribe with tokens', async () => {
      // Day1: subscribe with halfTokenAmount
      const halfTokenAmount = initTokenAmount / 2n
      await space.connect(f.user1).subscribe(testPlanId, halfTokenAmount, '')
      const subscriptionsDay1 = await space.getSubscriptions()

      // Check initial subscription
      expect(subscriptionsDay1.length).to.equal(1)
      expect(subscriptionsDay1[0].amount).to.equal(halfTokenAmount)

      // Day2: partially unsubscribe
      const secondBlockTimestamp = await moveForwardByDays(1)
      const partUnsubscribeAmount = subscriptionsDay1[0].amount / 2n
      await space.connect(f.user1).unsubscribe(testPlanId, partUnsubscribeAmount)

      const consumptionInfoAfterOneDay = calculateSubscriptionConsumed(
        subscriptionsDay1[0].startTime,
        subscriptionsDay1[0].duration,
        subscriptionsDay1[0].amount,
        secondBlockTimestamp,
      )
      const subscriptionsDay2 = await space.getSubscriptions()

      // Check after partial unsubscription
      expect(subscriptionsDay2.length).to.equal(1)
      expect(subscriptionsDay2[0].amount).to.equal(
        halfTokenAmount - partUnsubscribeAmount - consumptionInfoAfterOneDay.consumedAmount,
      )

      // Day3: resubscribe
      const thirdBlockTimestamp = await moveForwardByDays(1)
      await space.connect(f.user1).subscribe(testPlanId, halfTokenAmount, '')
      const subscriptionsDay3 = await space.getSubscriptions()
      const consumptionInfoAfterOneTwo = calculateSubscriptionConsumed(
        subscriptionsDay2[0].startTime,
        subscriptionsDay2[0].duration,
        subscriptionsDay2[0].amount,
        thirdBlockTimestamp,
      )

      // Check after resubscription
      expect(subscriptionsDay3.length).to.equal(1)
      expect(subscriptionsDay3[0].amount).to.equal(
        subscriptionsDay2[0].amount - consumptionInfoAfterOneTwo.consumedAmount + halfTokenAmount,
      )
    })
  })

  describe('Calculations', () => {
    let initTokenAmount = 0n
    const testPlanId = firstPlanId + 1

    beforeEach(async () => {
      await space.connect(spaceOwner).createPlan(testPlanName, testPlanPrice, testPlanMinEthAmount)

      await space.connect(f.user1).buy(0, { value: testPlanPrice })
      await space.connect(f.user2).buy(0, { value: testPlanPrice })
      await space.connect(f.user3).buy(0, { value: testPlanPrice })

      initTokenAmount = await space.balanceOf(f.user1.address)

      await space.connect(f.user1).approve(space, initTokenAmount)
      await space.connect(f.user2).approve(space, initTokenAmount)
      await space.connect(f.user3).approve(space, initTokenAmount)
    })

    it('should return zero consumed amount when subscription not found', async () => {
      const [consumedAmount, remainingDuration] = await space.calculateConsumedAmount(
        99,
        f.user1.address,
        await time.latest(),
      )

      expect(consumedAmount).to.equal(0)
      expect(remainingDuration).to.equal(0)
    })

    it('should return zero consumed amount when timestamp is before subscription start', async () => {
      await space.connect(f.user1).subscribe(testPlanId, initTokenAmount, '')
      const initialSubscriptions = await space.getSubscriptions()
      const subscription = initialSubscriptions[0]

      const invalidTimestamp = subscription.startTime - 1n
      const [consumedAmount, remainingDuration] = await space.calculateConsumedAmount(
        testPlanId,
        f.user1.address,
        invalidTimestamp,
      )

      expect(consumedAmount).to.equal(0)
      expect(remainingDuration).to.equal(0)
    })

    it('should consume all when subscription is expired', async () => {
      await space.connect(f.user1).subscribe(testPlanId, initTokenAmount, '')
      const initialSubscriptions = await space.getSubscriptions()
      const subscription = initialSubscriptions[0]

      // Move forward to after the subscription duration
      const expiredTimestamp = subscription.startTime + subscription.duration + 1n
      const [consumedAmount, remainingDuration] = await space.calculateConsumedAmount(
        testPlanId,
        f.user1.address,
        expiredTimestamp,
      )

      expect(consumedAmount).to.equal(subscription.amount)
      expect(remainingDuration).to.equal(0)
    })

    it('should calculate consumed amount correctly for partial duration', async () => {
      await space.connect(f.user1).subscribe(testPlanId, initTokenAmount, '')
      const initialSubscriptions = await space.getSubscriptions()
      const subscription = initialSubscriptions[0]

      // Move forward by half the subscription duration
      const halfDurationTimestamp = subscription.startTime + subscription.duration / 2n
      const [consumedAmount, remainingDuration] = await space.calculateConsumedAmount(
        testPlanId,
        f.user1.address,
        halfDurationTimestamp,
      )

      const expectPastDuration = halfDurationTimestamp - subscription.startTime
      const expectConsumedAmount = (subscription.amount * expectPastDuration) / subscription.duration

      expect(subscription.amount).to.equal(initTokenAmount)
      expect(consumedAmount).to.closeTo(expectConsumedAmount, 1)
      expect(remainingDuration).to.closeTo(expectPastDuration, 1)
    })

    it('should calculate consumed amount correctly', async () => {
      await space.connect(f.user1).subscribe(testPlanId, initTokenAmount, '')

      const initialSubscriptions = await space.getSubscriptions()
      const subscription = initialSubscriptions[0]

      // Move forward by 1 day
      const nextBlockTimestamp = await moveForwardByDays(1)

      const [consumedAmount, remainingDuration] = await space.calculateConsumedAmount(
        testPlanId,
        f.user1.address,
        nextBlockTimestamp,
      )

      const expectedResults = calculateSubscriptionConsumed(
        subscription.startTime,
        subscription.duration,
        subscription.amount,
        nextBlockTimestamp,
      )

      // Assertions
      expect(consumedAmount).to.equal(expectedResults.consumedAmount)
      expect(remainingDuration).to.equal(expectedResults.remainingDuration)
    })
  })

  describe('DistributeSubscription', () => {
    let initTokenAmount = 0n
    const testPlanId = firstPlanId + 1

    beforeEach(async () => {
      await space.connect(spaceOwner).createPlan(testPlanName, testPlanPrice, testPlanMinEthAmount)
      await space.connect(f.user1).buy(0, { value: testPlanPrice })
      initTokenAmount = await space.balanceOf(f.user1.address)
      await space.connect(f.user1).approve(space, initTokenAmount)
      await space.connect(f.user1).subscribe(testPlanId, initTokenAmount, '')
    })

    it('should return zero for non-existent subscription', async () => {
      await space.distributeSingleSubscription(99, f.user1.address)
      const subscriptions = await space.getSubscriptions()
      expect(subscriptions[0].amount).to.equal(initTokenAmount)
    })

    it('should update subscription start time after distribution', async () => {
      // Move forward by one day
      const nextBlockTimestamp = await moveForwardByDays(1)
      await space.distributeSingleSubscription(testPlanId, f.user1.address)

      const subscriptions = await space.getSubscriptions()
      const updatedSubscription = subscriptions[0]

      expect(updatedSubscription.startTime).to.equal(nextBlockTimestamp)
    })
  })

  describe('Check one month subscription', () => {
    it('By eth', async () => {
      await subscribeByEth(space, f.user1, defaultPlanPrice)
      // Verify subscription details
      const subscriptions = await space.getSubscriptions()
      expect(subscriptions.length).to.equal(1)

      // expect(subscriptions[0].duration).to.equal(SECONDS_PER_MONTH)
      await checkSubscriptionDuration(space, f.user1, 30)
    })

    it('By token', async () => {
      const { tokenAmountAfterFee } = await buy(space, f.user1, defaultPlanPrice)
      const user1Balance = await space.balanceOf(f.user1.address)
      expect(user1Balance).to.equal(tokenAmountAfterFee)

      await subscribe(space, f.user1, tokenAmountAfterFee)

      // Verify subscription details
      const subscriptions = await space.getSubscriptions()
      expect(subscriptions.length).to.equal(1)

      // expect(subscriptions[0].duration).to.equal(SECONDS_PER_MONTH)
      await checkSubscriptionDuration(space, f.user1, 30)
    })
  })

  /**
   * Calculates the current Ethereum amount without fee based on the token amount.
   *
   * @param tokenAmount - The amount of tokens to calculate the equivalent Ethereum amount for.
   * @returns A promise that resolves to the Ethereum amount equivalent to the given token amount without considering any fees.
   */
  async function getCurrentEthAmountWithoutFee(tokenAmount: bigint): Promise<bigint> {
    const spaceInfo = await getSpaceInfo(space)
    const { x, y, k } = spaceInfo
    const ethAmount = getEthAmountWithoutFee(x, y, k, tokenAmount)
    return ethAmount
  }

  async function getCurrentTokenAmountWithoutFee(ethAmount: bigint): Promise<bigint> {
    const spaceInfo = await getSpaceInfo(space)
    const { x, y, k } = spaceInfo
    const tokenAmount = getTokenAmountWithoutFee(x, y, k, ethAmount)
    return tokenAmount
  }

  /**
   * Advances the blockchain time forward by a specified number of days.
   *
   * @param days - The number of days to move forward.
   * @returns A promise that resolves to the new block timestamp after moving forward.
   */
  async function moveForwardByDays(days: number) {
    const newTimestamp = BigInt(await time.latest()) + BigInt(days) * SECONDS_PER_DAY
    await time.setNextBlockTimestamp(newTimestamp)
    return newTimestamp
  }
})
