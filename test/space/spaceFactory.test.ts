import { approve } from '@utils/approve'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Space } from 'types'

describe('Space', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it.only('create()', async () => {
    const amount = 1
    const spaceIndex0 = await f.spaceFactory.spaceIndex()
    const spaceName = 'Test Space'

    await f.spaceFactory.connect(f.user0).create(
      spaceName,
      'TEST',
      {
        name: spaceName,
        uri: '',
        appId: 0n,
        curatorFeePercent: precision.token(30, 16),
        curve: {
          basePrice: precision.token(5, 6),
          inflectionPoint: 100,
          inflectionPrice: precision.token(400, 6),
          linearPriceSlope: 0,
        },
        farmer: 0n,
        isFarming: false,
      },
      {
        name: spaceName,
        uri: '',
        appId: 0n,
        curatorFeePercent: precision.token(30, 16),
        curve: {
          basePrice: precision.token(5, 6),
          inflectionPoint: 100,
          inflectionPrice: precision.token(400, 6),
          linearPriceSlope: 0,
        },
        farmer: 0n,
        isFarming: false,
      },
    )

    const spaceIndex1 = await f.spaceFactory.spaceIndex()
    console.log('======spaceIndex1:', spaceIndex1)
    const spaceAddr = await f.spaceFactory.spaces(spaceIndex0)
    const space = await getSpace(spaceAddr)

    const info = await space.getInfo()
    console.log('space=====:', spaceAddr, 'name:', info)
    const balance = await f.indieX.balanceOf(spaceAddr, info.creationId)
    const creation = await f.indieX.getCreation(info.creationId)
    console.log('========>>>>>balance:', balance)
    expect(info.name).to.equal(spaceName)
    expect(balance).to.equal(1n)

    const spaceUsdcBalance0 = await f.usdc.balanceOf(spaceAddr)
    console.log('=====>>spaceUsdcBalance0:', spaceUsdcBalance0)

    const {
      priceAfterFee: buyPriceAfterFee,
      price: buyPrice,
      creatorFee,
      appFee,
      protocolFee,
    } = await f.indieX.getBuyPriceAfterFee(creation.id, amount, creation.appId)

    await approve(f, f.indieXAddress, buyPriceAfterFee, f.user1)
    const tx1 = await f.indieX.connect(f.user1).buy(creation.id, amount, ZeroAddress)
    await tx1.wait()

    const spaceUsdcBalance1 = await f.usdc.balanceOf(spaceAddr)
    console.log('=====>>spaceUsdcBalance1:', spaceUsdcBalance1)
    expect(spaceUsdcBalance1 - spaceUsdcBalance0).to.equal(creatorFee)

    const { priceAfterFee: buyPriceAfterFee2, creatorFee: creatorFee2 } = await f.indieX.getBuyPriceAfterFee(
      creation.id,
      amount,
      creation.appId,
    )

    await approve(f, f.indieXAddress, buyPriceAfterFee2, f.user1)
    const tx2 = await f.indieX.connect(f.user1).buy(creation.id, amount, ZeroAddress)
    await tx2.wait()

    const spaceUsdcBalance2 = await f.usdc.balanceOf(spaceAddr)
    expect(spaceUsdcBalance2 - spaceUsdcBalance1).to.equal(creatorFee2)
  })
})

async function getSpace(addr: string) {
  return ethers.getContractAt('Space', addr) as any as Promise<Space>
}
