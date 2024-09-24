import { Fixture, deployFixture } from '@utils/deployFixture'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { Space } from 'types'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { describe } from 'mocha'
import {
  SECONDS_PER_MONTH,
  approve,
  buy,
  createSpace,
  getPlan,
  getSubscription,
  getSpaceInfo,
  getEthAmountWithoutFee,
  calculateSubscriptionConsumed,
  getTokenPricePerSecondWithMonthlyPrice,
  getTokenAmount,
  getEthAmount,
  getSpace,
} from './utils'

import { distributeCreatorRevenue } from './utils/revenueUtil'

describe('Member', function () {
  let f: Fixture

  let space: Space
  let spaceAddr: string
  let premint = BigInt(0)
  let spaceOwner: HardhatEthersSigner

  let testPlanId = 1
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

    await space.connect(spaceOwner).createPlan(testPlanName, testPlanPrice, testPlanMinEthAmount)
  })

  describe('Token Subscription', () => {
    this.beforeEach(async () => {})

    it('one user first subscribe by token', async () => {
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

      // prepeare
      //   1. user1 buy some token
      //   2. aprove all tokens
      //   3. use all tokens to subscribe
      //   4. calculate revenue
      const { creatorFee, protocolFee } = await buy(space, f.user1, testPlanPrice)
      const balanceOfToken = await space.balanceOf(f.user1.address)
      await approve(space, f.user1, balanceOfToken)
      await expect(space.connect(f.user1).subscribe(testPlanId, balanceOfToken))
        .to.emit(space, 'Subscribed')
        .withArgs(
          testPlanId,
          f.user1.address,
          balanceOfToken,
          (increasingDuration: bigint) => increasingDuration > 0n,
          (remainingDuration: bigint) => remainingDuration > 0,
        )
      const balanceOfTokenAfterSubscribe = await space.balanceOf(f.user1.address)
      const subscription = await getSubscription(space, testPlanId, f.user1.address)

      const { stakingRevenue: expectStakingRevenue, daoRevenue: expectDaoRevenue } = distributeCreatorRevenue(
        creatorFee,
        precision.token(0),
      )

      const { stakingRevenue, daoRevenue } = await getSpaceInfo(space)

      // expect
      expect(balanceOfToken).to.eq(exceptTokenAmount)
      expect(balanceOfTokenAfterSubscribe).to.eq(0)
      expect(subscription.duration).to.eq(exceptDurations)
      expect(subscription.amount).to.eq(exceptTokenAmount)

      expect(await space.balanceOf(f.spaceFactoryAddr)).to.eq(protocolFee)
      expect(stakingRevenue).to.eq(expectStakingRevenue)
      expect(daoRevenue).to.eq(expectDaoRevenue)
    })

    it('one user first subscribe for 1 month', (async) => {})
  })
})
