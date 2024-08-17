import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space } from 'types'

describe('Member', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('Member', async () => {
    const spaceIndex0 = await f.spaceFactory.spaceIndex()
    const spaceName = 'Test Space'

    await f.spaceFactory.connect(f.user0).createSpace(spaceName, 'TEST', {
      uri: spaceName,
      appId: 0n,
      curatorFeePercent: precision.token(30, 16),
      curve: {
        basePrice: precision.token(0.1),
        inflectionPoint: 100,
        inflectionPrice: precision.token(1),
        linearPriceSlope: 0,
      },
      farmer: 0n,
      isFarming: false,
    })

    const spaceAddr = await f.spaceFactory.spaces(spaceIndex0)
    const space = await getSpace(spaceAddr)
    const founder0 = await space.getContributor(f.user0.address)

    await buy(space, f.user1, precision.token('0.002048'))

    const user1Balance0 = await space.balanceOf(f.user1.address)
    console.log('=====user1Balance0:', user1Balance0)

    await increaseSubscriptionByToken(space, f.user1, user1Balance0)

    const user1Balance1 = await space.balanceOf(f.user1.address)
    expect(user1Balance1).to.equal(0)

    const tokenPricePerSecond = await space.getTokenPricePerSecond()

    // console.log('>>>>>>>>>>>>times:', 2566253 / (60 * 60 * 24))
    console.log('>>>>>>>>>>>>times:', 2592175 / (60 * 60 * 24))

    await time.increase(60 * 60 * 24 * 15) // after 15 days

    // const now = Math.floor(Date.now() / 1000)
    const now0 = await time.latest()

    // const payed = await space.payedAmount(f.user1.address, now)
    // console.log('======payed:', payed, precision.toDecimal(payed))

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

    await increaseSubscriptionByToken(space, f.user1, user1Balance2)

    const subscription2 = await space.getSubscription(f.user1.address)
    console.log('======subscription2:', subscription2)

    const now1 = await time.latest()
    const remain = subscription2.start + subscription2.duration - BigInt(now1)

    console.log('>>>>>>>>>>>> remain days:', Number(remain) / (60 * 60 * 24))

    const user1Balance3 = await space.balanceOf(f.user1.address)
    expect(user1Balance3).to.equal(0)

    await decreaseSubscriptionByToken(space, f.user1, (subscription2.amount - subscription2.payed) / 2n)

    {
      const subscription2 = await space.getSubscription(f.user1.address)
      console.log('======subscription2:', subscription2)

      const now1 = await time.latest()
      const remain = subscription2.start + subscription2.duration - BigInt(now1)
      console.log('>>>>>>>>>>>> remain day2:', Number(remain) / (60 * 60 * 24))
    }

    {
      const subscription1 = await space.getSubscription(f.user1.address)
      await decreaseSubscriptionByToken(space, f.user1, subscription1.amount - subscription1.payed - 10n)

      const subscription2 = await space.getSubscription(f.user1.address)
      console.log('======subscription2:', subscription2)

      // const now1 = await time.latest()
      // const remain = subscription2.start + subscription2.duration - BigInt(now1)

      // console.log('>>>>>>>>>>>> remain day2:', Number(remain) / (60 * 60 * 24))
    }
  })
})

async function getSpace(addr: string) {
  return ethers.getContractAt('Space', addr) as any as Promise<Space>
}

export async function approve(space: Space, spender: string, value: bigint, account: HardhatEthersSigner) {
  const tx = await space.connect(account).approve(spender, value)
  await tx.wait()
}

export async function buy(space: Space, account: HardhatEthersSigner, value: bigint) {
  const tx = await space.connect(account).buy({
    value: value,
  })
  await tx.wait()
}

export async function increaseSubscriptionByToken(space: Space, account: HardhatEthersSigner, value: bigint) {
  const spaceAddr = await space.getAddress()
  await approve(space, spaceAddr, value, account)
  const tx = await space.connect(account).increaseSubscriptionByToken(value)
  await tx.wait()
}

export async function decreaseSubscriptionByToken(space: Space, account: HardhatEthersSigner, amount: bigint) {
  const tx = await space.connect(account).decreaseSubscriptionByToken(amount)
  await tx.wait()
}

export async function distributeSubscriptionRewards(space: Space) {
  const tx = await space.distributeSubscriptionRewards()
  await tx.wait()
}

async function reconciliation(f: Fixture, space: Space) {
  const ethBalance = await ethers.provider.getBalance(await space.getAddress())
  const info = await space.getSpaceInfo()
  // TODO: not right
  expect(ethBalance).to.equal(info.daoFees + info.stakingFees)
}
