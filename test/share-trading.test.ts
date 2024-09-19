import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space } from 'types'
import { createSpace, executeShareOrder, getContributor, getSpaceInfo, SHARES_SUPPLY } from './utils'

const sharePrice = precision.token('0.005')

describe('share-trading', function () {
  let f: Fixture

  let space: Space
  beforeEach(async () => {
    f = await deployFixture()
    const spaceName = 'Test Space'
    const res = await createSpace(f, f.user0, spaceName)
    space = res.space
  })

  it('transferShares', async () => {
    const founder0 = await getContributor(space, f.user0.address)

    await expect(space.connect(f.user2).transferShares(f.user1.address, 10000n)).to.revertedWithCustomError(
      f.share,
      'OnlyContributor',
    )

    await expect(space.connect(f.user0).transferShares(f.user1.address, SHARES_SUPPLY + 1n)).to.revertedWithCustomError(
      f.share,
      'InsufficientShares',
    )

    await expect(space.connect(f.user0).transferShares(ZeroAddress, 1000n)).to.revertedWithCustomError(
      f.share,
      'InvalidRecipient',
    )

    await expect(space.connect(f.user0).transferShares(f.user0.address, 1000n)).to.revertedWithCustomError(
      f.share,
      'InvalidRecipient',
    )

    const tx0 = await space.connect(f.user0).transferShares(f.user1.address, 10000n)
    await tx0.wait()

    const contributors = await space.getContributors()
    expect(contributors.length).to.equal(2)

    const founder1 = await getContributor(space, f.user0.address)
    const contributor = await getContributor(space, f.user1.address)

    expect(founder1.shares + contributor.shares).to.equal(SHARES_SUPPLY)
    expect(contributor.shares).to.equal(10000n)
    expect(founder0.shares - 10000n).to.equal(founder1.shares)

    const tx1 = await space.connect(f.user0).transferShares(f.user1.address, 10000n)
    await tx1.wait()

    {
      const contributors = await space.getContributors()
      expect(contributors.length).to.equal(2)

      const founder1 = await getContributor(space, f.user0.address)
      const contributor = await getContributor(space, f.user1.address)

      expect(founder1.shares + contributor.shares).to.equal(SHARES_SUPPLY)
      expect(contributor.shares).to.equal(20000n)
      expect(founder0.shares - 20000n).to.equal(founder1.shares)
    }
  })

  /**
   * case steps:
   * 1. founder create a share order with 100_000 shares
   * 2. founder create another share order with 10_000 shares
   */
  it('createShareOrder', async () => {
    const founder0 = await getContributor(space, f.user0.address)

    await expect(space.connect(f.user1).createShareOrder(10000n, sharePrice)).to.revertedWithCustomError(
      f.share,
      'InsufficientShares',
    )

    await expect(space.connect(f.user1).createShareOrder(0, sharePrice)).to.revertedWithCustomError(
      f.share,
      'AmountIsZero',
    )

    // step 1
    {
      const tx0 = await space.connect(f.user0).createShareOrder(100_000, sharePrice)
      await tx0.wait()

      const orders = await space.getShareOrders()
      expect(orders.length).to.equal(1)

      expect(orders[0].seller).to.equal(f.user0.address)
      expect(orders[0].amount).to.equal(100_000)
      expect(orders[0].price).to.equal(sharePrice)

      const info1 = await getSpaceInfo(space)
      expect(info1.orderIndex).to.equal(1)
    }

    {
      // step 2
      const tx0 = await space.connect(f.user0).createShareOrder(10_000, sharePrice)
      await tx0.wait()

      const orders = await space.getShareOrders()
      expect(orders.length).to.equal(2)

      expect(orders[1].seller).to.equal(f.user0.address)
      expect(orders[1].amount).to.equal(10_000)
      expect(orders[1].price).to.equal(sharePrice)

      const info1 = await getSpaceInfo(space)
      expect(info1.orderIndex).to.equal(2)
    }
  })

  it('cancelShareOrder', async () => {
    const founder0 = await getContributor(space, f.user0.address)

    const tx0 = await space.connect(f.user0).createShareOrder(100_000, sharePrice)
    await tx0.wait()

    await expect(space.connect(f.user0).cancelShareOrder(10)).to.revertedWithCustomError(f.share, 'OrderNotFound')

    await expect(space.connect(f.user1).cancelShareOrder(0)).to.revertedWithCustomError(f.share, 'OnlySeller')

    const orders0 = await space.getShareOrders()
    expect(orders0.length).to.equal(1)

    const info0 = await getSpaceInfo(space)
    // expect(info0.orderIds.length).to.equal(1)

    await space.connect(f.user0).cancelShareOrder(0)

    const orders1 = await space.getShareOrders()
    const info1 = await getSpaceInfo(space)

    // expect(info1.orderIds.length).to.equal(0)
    expect(orders1.length).to.equal(0)
  })

  /**
   * case steps:
   * 1. founder create a share order with 100_000 shares
   * 2. user1 execute share order with 10_000 shares
   * 3. user2 execute share order with 10_000 shares
   * 4. user1 execute share order with 80_000 shares
   */

  it('executeShareOrder', async () => {
    // step 1
    const tx0 = await space.connect(f.user0).createShareOrder(100_000, sharePrice)
    await tx0.wait()

    await expect(space.connect(f.user1).executeShareOrder(10n, 1000n)).to.revertedWithCustomError(
      f.share,
      'OrderNotFound',
    )

    await expect(space.connect(f.user1).executeShareOrder(0n, 200_000n)).to.revertedWithCustomError(
      f.share,
      'OrderAmountTooLarge',
    )

    const contributors0 = await space.getContributors()

    expect(contributors0.length).to.equal(1)

    await expect(space.connect(f.user1).executeShareOrder(0n, 10_000n)).to.revertedWithCustomError(
      f.share,
      'InsufficientPayment',
    )

    const user0EthBalance0 = await ethers.provider.getBalance(f.user0.address)
    const user1EthBalance0 = await ethers.provider.getBalance(f.user1.address)
    const user2EthBalance0 = await ethers.provider.getBalance(f.user2.address)

    // step 2
    const { gasCost: gasCost1 } = await executeShareOrder(space, f.user1, 0n, 10_000n)

    /** check contributors  */
    const contributors1 = await space.getContributors()
    expect(contributors1.length).to.equal(2)
    const contributor = await getContributor(space, f.user1.address)
    expect(contributor.shares).to.equal(10_000n)
    expect(contributor.rewards).to.equal(0)
    expect(contributor.account).to.equal(f.user1.address)

    /** check order */
    const orders0 = await space.getShareOrders()
    const info0 = await getSpaceInfo(space)
    expect(orders0.length).to.equal(1)
    // TODO:
    // expect(info0.orderIds.length).to.equal(1)

    // order should be changed
    expect(orders0[0].amount).to.equal(90_000)
    expect(orders0[0].seller).to.equal(f.user0.address)
    expect(orders0[0].price).to.equal(sharePrice)

    /** check share amount */
    const user0Contributor1 = await getContributor(space, f.user0.address)
    const user1Contributor1 = await getContributor(space, f.user1.address)
    expect(user0Contributor1.shares).to.equal(SHARES_SUPPLY - 10_000n)
    expect(user1Contributor1.shares).to.equal(10_000n)

    const user0EthBalance1 = await ethers.provider.getBalance(f.user0.address)
    const user1EthBalance1 = await ethers.provider.getBalance(f.user1.address)
    const user2EthBalance1 = await ethers.provider.getBalance(f.user2.address)

    /** check eth funds */
    expect(user0EthBalance1 - user0EthBalance0).to.greaterThan(0)
    expect(user1EthBalance1 - user1EthBalance0).to.lessThan(0)
    expect(user0EthBalance1 - user0EthBalance0).to.equal(user1EthBalance0 - user1EthBalance1 - gasCost1)

    // step 3
    const { gasCost: gasCost2 } = await executeShareOrder(space, f.user2, 0n, 10_000n)

    /** check share amount */
    const user0Contributor2 = await getContributor(space, f.user0.address)
    const user2Contributor2 = await getContributor(space, f.user2.address)
    expect(user0Contributor2.shares).to.equal(SHARES_SUPPLY - 20_000n)
    expect(user2Contributor2.shares).to.equal(10_000n)

    const user0EthBalance2 = await ethers.provider.getBalance(f.user0.address)
    const user1EthBalance2 = await ethers.provider.getBalance(f.user1.address)
    const user2EthBalance2 = await ethers.provider.getBalance(f.user2.address)

    /** check eth funds */
    expect(user0EthBalance2 - user0EthBalance1).to.equal(user2EthBalance1 - user2EthBalance2 - gasCost2)

    // step 4
    const { gasCost: gasCost3 } = await executeShareOrder(space, f.user1, 0n, 80_000n)

    /** check share amount */
    const user0Contributor3 = await getContributor(space, f.user0.address)
    const user1Contributor3 = await getContributor(space, f.user1.address)
    expect(user0Contributor3.shares).to.equal(SHARES_SUPPLY - 100_000n)
    expect(user1Contributor3.shares).to.equal(90_000n)

    const user0EthBalance3 = await ethers.provider.getBalance(f.user0.address)
    const user1EthBalance3 = await ethers.provider.getBalance(f.user1.address)
    const user2EthBalance3 = await ethers.provider.getBalance(f.user2.address)

    /** check eth funds */
    expect(user0EthBalance3 - user0EthBalance2).to.equal(user1EthBalance2 - user1EthBalance3 - gasCost3)

    // Get total eth from order
    expect(user0EthBalance3 - user0EthBalance0).to.equal(sharePrice * 100_000n)

    {
      const orders0 = await space.getShareOrders()
      expect(orders0.length).to.equal(0)

      const info0 = await getSpaceInfo(space)
      // expect(info0.orderIds.length).to.equal(0)
    }
  })

  afterEach(async () => {
    const contributors = await space.getContributors()
    const shares = contributors.reduce((acc, contributor) => acc + contributor.shares, 0n)
    expect(shares).to.equal(SHARES_SUPPLY)
  })
})
