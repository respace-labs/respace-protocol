import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space } from 'types'
import { buy, createSpace, distributeSubscriptionRewards, subscribeByToken, unsubscribeByToken } from './utils'

describe('Member', function () {
  let f: Fixture

  let space: Space
  let spaceAddr: string
  beforeEach(async () => {
    f = await deployFixture()

    const spaceName = 'Test Space'

    const res = await createSpace(f, f.user0, spaceName)
    spaceAddr = res.spaceAddr
    space = res.space
  })

  it('subscribeByToken', async () => {
    await buy(space, f.user1, precision.token('0.002048'))

    const user1Balance0 = await space.balanceOf(f.user1.address)
    console.log('=====user1Balance0:', user1Balance0)

    await subscribeByToken(space, f.user1, user1Balance0)

    const user1Balance1 = await space.balanceOf(f.user1.address)
    expect(user1Balance1).to.equal(0)

    const tokenPricePerSecond = await space.getTokenPricePerSecond()

    // console.log('>>>>>>>>>>>>times:', 2566253 / (60 * 60 * 24))
    console.log('>>>>>>>>>>>>times:', 2592175 / (60 * 60 * 24))

    await time.increase(60 * 60 * 24 * 15) // after 15 days

    // const now = Math.floor(Date.now() / 1000)
    const now0 = await time.latest()

    // const consumed = await space.consumedAmount(f.user1.address, now)
    // console.log('======consumed:', consumed, precision.toDecimal(consumed))

    const subscription0 = await space.getSubscription(f.user1.address)
    console.log('======subscription0:', subscription0)
    await distributeSubscriptionRewards(space)

    const subscription1 = await space.getSubscription(f.user1.address)
    console.log('======subscription1:', subscription1)

    await buy(space, f.user1, precision.token('0.002048'))

    const tx = await space.connect(f.user0).setSubscriptionPrice(precision.token('0.004096'))
    await tx.wait()

    const memberInfo = await space.getMemberInfo()
    expect(memberInfo.subscriptionPrice).to.equal(precision.token('0.004096'))

    const user1Balance2 = await space.balanceOf(f.user1.address)

    await subscribeByToken(space, f.user1, user1Balance2)

    const subscription2 = await space.getSubscription(f.user1.address)
    console.log('======subscription2:', subscription2)

    const now1 = await time.latest()
    const remain = subscription2.start + subscription2.duration - BigInt(now1)

    console.log('>>>>>>>>>>>> remain days:', Number(remain) / (60 * 60 * 24))

    const user1Balance3 = await space.balanceOf(f.user1.address)
    expect(user1Balance3).to.equal(0)

    await unsubscribeByToken(space, f.user1, (subscription2.amount - subscription2.consumed) / 2n)

    {
      const subscription2 = await space.getSubscription(f.user1.address)
      console.log('======subscription2:', subscription2)

      const now1 = await time.latest()
      const remain = subscription2.start + subscription2.duration - BigInt(now1)
      console.log('>>>>>>>>>>>> remain day2:', Number(remain) / (60 * 60 * 24))
    }

    {
      const subscription1 = await space.getSubscription(f.user1.address)
      await unsubscribeByToken(space, f.user1, subscription1.amount - subscription1.consumed - 10n)

      const subscription2 = await space.getSubscription(f.user1.address)
      console.log('======subscription2:', subscription2)

      // const now1 = await time.latest()
      // const remain = subscription2.start + subscription2.duration - BigInt(now1)

      // console.log('>>>>>>>>>>>> remain day2:', Number(remain) / (60 * 60 * 24))
    }
  })

  it('subscribeByEth', async () => {
    const [x, y, k] = await space.token()
    expect(x * y).to.equal(k)

    // const ethAmount = precision.token('0.002048')
    const ethAmount = precision.token('0.0002048')

    const tx = await space.connect(f.user1).subscribeByEth({
      value: ethAmount,
    })
    await tx.wait()

    const user1Balance = await space.balanceOf(f.user1.address)
    const spaceBalance = await space.balanceOf(spaceAddr)
    const supply = await space.totalSupply()
    const subscriptions = await space.getSubscriptions()
    const subscription = await space.getSubscription(f.user1.address)
    const info = await space.getMemberInfo()

    expect(user1Balance).to.equal(0)
    expect(spaceBalance).to.equal(supply)
    expect(subscriptions.length).to.equal(1n)
    expect(subscription.start).to.equal(subscription.checkpoint)
    expect(subscription.amount).to.equal(spaceBalance)
    expect(subscription.consumed).to.equal(0)
    expect(info.subscriptionIncome).to.equal(0)

    const remain = subscription.start + subscription.duration - BigInt(await time.latest())

    console.log('>>>>>>>>>>>> remain:', Number(remain) / (60 * 60 * 24))
  })

  it('unsubscribeByToken', async () => {
    const ethAmount = precision.token('0.002048')

    const tx0 = await space.connect(f.user1).subscribeByEth({
      value: ethAmount,
    })
    await tx0.wait()

    const subscription = await space.getSubscription(f.user1.address)

    // const user1Balance = await space.balanceOf(f.user1.address)
    // const spaceBalance = await space.balanceOf(spaceAddr)
    // const supply = await space.totalSupply()
    // const subscriptions = await space.getSubscriptions()
    // const info = await space.getMemberInfo()

    const remain = subscription.start + subscription.duration - BigInt(await time.latest())

    console.log('>>>>>>>>>>>> remain:', Number(remain) / (60 * 60 * 24))

    // await time.increase(60 * 60 * 24 * 15) // after 15 days

    const decreaseAmount = (subscription.amount - subscription.consumed) / 2n
    await unsubscribeByToken(space, f.user1, decreaseAmount)

    const user1Balance = await space.balanceOf(f.user1.address)
    expect(user1Balance).to.equal(decreaseAmount)
  })
})
