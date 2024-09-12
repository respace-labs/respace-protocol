import { Fixture, deployFixture } from '@utils/deployFixture'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { Space } from 'types'
import { createSpace, getPlan, getSpaceInfo, SECONDS_PER_MONTH, getEthAmountWithoutFee } from './utils'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { describe } from 'mocha'

describe('Member', function () {
  let f: Fixture

  const firstPlanId = 0
  let space: Space
  let spaceAddr: string
  let premint = BigInt(0)
  let spaceOwner: HardhatEthersSigner

  let defaultPlanName = 'Member'
  let defaultPlanPrice = precision.token('0.002048')

  let testPlanName = 'Test Plan'
  let testPlanPrice = precision.token('0.02')
  let testPlanMinEthAmount = precision.token('0.002')

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

      const plan = await getPlan(space, 0)
      expect(plan.uri).to.equal(defaultPlanName)
      expect(plan.price).to.equal(defaultPlanPrice)
      expect(plan.isActive).to.equal(true)
    })

    it('should create a new plan', async () => {
      await expect(space.connect(spaceOwner).createPlan(testPlanName, testPlanPrice, testPlanMinEthAmount))
        .to.emit(space, 'PlanCreated')
        .withArgs(1, testPlanName, testPlanPrice, testPlanMinEthAmount)

      const plans = await space.getPlans()
      expect(plans.length).to.equal(2) // Including the initial plan
      expect(plans[1].uri).to.equal(testPlanName)
      expect(plans[1].price).to.equal(testPlanPrice)
      expect(plans[1].minEthAmount).to.equal(testPlanMinEthAmount)
      expect(plans[1].isActive).to.equal(true)
    })

    it('should update an existing plan', async () => {
      await space.connect(spaceOwner).updatePlan(0, testPlanName, testPlanPrice, testPlanMinEthAmount, false)

      const updatedPlan = await getPlan(space, 0)
      expect(updatedPlan.uri).to.equal(testPlanName)
      expect(updatedPlan.price).to.equal(testPlanPrice)
      expect(updatedPlan.minEthAmount).to.equal(testPlanMinEthAmount)
      expect(updatedPlan.isActive).to.equal(false)
    })

    it('should revert when updating a non-existent plan', async () => {
      await expect(
        space.connect(spaceOwner).updatePlan(99, 'Non-existent Plan', testPlanPrice, testPlanMinEthAmount, true),
      ).to.be.revertedWith('Plan is not existed')
    })

    it('should update plan benefits', async () => {
      await expect(space.connect(f.user0).updatePlanBenefits(0, 'New Benefits'))
        .to.emit(space, 'PlanBenefitsUpdated')
        .withArgs(0, 'New Benefits')
    })
  })

  describe('Eth Subscription', () => {
    it('should allow a user to subscribe to a plan', async () => {
      const initialPlans = await space.getPlans()
      expect(initialPlans.length).to.be.greaterThan(0)

      const ethAmount = precision.token('0.01')
      await space.connect(f.user1).subscribeByEth(firstPlanId, { value: ethAmount })

      const subscriptions = await space.getSubscriptions()
      expect(subscriptions.length).to.equal(1)
      expect(subscriptions[0].planId).to.equal(firstPlanId)
      expect(subscriptions[0].account).to.equal(f.user1.address)
      expect(subscriptions[0].amount).to.be.greaterThan(0)
    })

    it('should fail if the plan does not exist', async () => {
      const nonExistentPlanId = 254
      const ethAmount = precision.token('0.01')
      await expect(space.connect(f.user1).subscribeByEth(nonExistentPlanId, { value: ethAmount })).to.be.revertedWith(
        'Plan is not existed',
      )
    })

    it('should fail if the ETH amount is less than the minimum required', async () => {
      await space.connect(spaceOwner).createPlan(testPlanName, testPlanPrice, testPlanMinEthAmount)

      const planId = firstPlanId + 1
      const insufficientEthAmount = testPlanMinEthAmount - precision.token('0.00001') // Less than the plan's minimum
      await expect(space.connect(f.user1).subscribeByEth(planId, { value: insufficientEthAmount })).to.be.revertedWith(
        'ETH amount is less than minimum amount',
      )
    })

    it('should allow a user to subscribe multiple times', async () => {
      const initialPlans = await space.getPlans()
      expect(initialPlans.length).to.be.greaterThan(0)

      const ethAmount = precision.token('0.01')
      await space.connect(f.user1).subscribeByEth(firstPlanId, { value: ethAmount })
      await space.connect(f.user1).subscribeByEth(firstPlanId, { value: ethAmount })

      const subscriptions = await space.getSubscriptions()
      expect(subscriptions.length).to.equal(1)
      expect(subscriptions[0].planId).to.equal(firstPlanId)
      expect(subscriptions[0].account).to.equal(f.user1.address)
      expect(subscriptions[0].amount).to.be.greaterThan(0)
    })

    it('should calculate subscription duration correctly based on ETH amount', async () => {
      await space.connect(spaceOwner).createPlan(testPlanName, testPlanPrice, testPlanMinEthAmount)

      const planId = firstPlanId + 1
      const ethAmount = precision.token('1')

      await space.connect(f.user1).subscribeByEth(planId, { value: ethAmount })
      const subscriptions = await space.getSubscriptions()

      expect(subscriptions.length).to.equal(1)
      expect(subscriptions[0].planId).to.equal(planId)
      expect(subscriptions[0].account).to.equal(f.user1.address)
      expect(subscriptions[0].amount).to.be.greaterThan(0)
      expect(subscriptions[0].duration).to.be.greaterThan(0)

      const expectedDuration = (ethAmount * SECONDS_PER_MONTH) / testPlanPrice
      expect(subscriptions[0].duration).to.be.closeTo(expectedDuration, 1)
    })
  })

  describe('Token Subscription', () => {
    it('should revert if token amount is zero', async () => {
      await expect(space.connect(f.user1).subscribe(firstPlanId, 0)).to.be.revertedWith(
        'Amount must be greater than zero',
      )
    })

    it('should fail if tokens are not approved for transfer', async () => {
      const tokenAmount = precision.token('1')

      await expect(space.connect(f.user1).subscribe(firstPlanId, tokenAmount)).to.be.revertedWithCustomError(
        space,
        'ERC20InsufficientAllowance',
      )
    })

    it('should fail if user has insufficient token balance', async () => {
      const tokenAmount = precision.token('1')
      await space.connect(f.user1).approve(space, tokenAmount)

      await expect(space.connect(f.user1).subscribe(firstPlanId, tokenAmount)).to.be.revertedWithCustomError(
        space,
        'ERC20InsufficientBalance',
      )
    })

    it('should allow subscription using tokens', async () => {
      await space.connect(spaceOwner).createPlan(testPlanName, testPlanPrice, testPlanMinEthAmount)
      await space.connect(f.user1).buy(0, { value: testPlanPrice })

      const balanceOfToken = await space.balanceOf(f.user1.address)
      const spaceInfo = await getSpaceInfo(space)
      const { x, y, k } = spaceInfo
      const planId = firstPlanId + 1
      const ethAmount = getEthAmountWithoutFee(x, y, k, balanceOfToken)

      await space.connect(f.user1).approve(space, balanceOfToken)
      await space.connect(f.user1).subscribe(planId, balanceOfToken)

      const subscriptions = await space.getSubscriptions()
      expect(subscriptions.length).to.equal(1)
      expect(subscriptions[0].planId).to.equal(planId)
      expect(subscriptions[0].account).to.equal(f.user1.address)
      expect(subscriptions[0].amount).to.be.greaterThan(0)
      expect(subscriptions[0].duration).to.be.greaterThan(0)

      const expectedDuration = (ethAmount * SECONDS_PER_MONTH) / testPlanPrice
      expect(subscriptions[0].duration).to.be.closeTo(expectedDuration, 1)
    })
  })
})
