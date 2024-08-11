import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Space } from 'types'

describe.only('Space', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('create()', async () => {
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
          basePrice: precision.token(0.1),
          inflectionPoint: 100,
          inflectionPrice: precision.token(1),
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
          basePrice: precision.token(0.1),
          inflectionPoint: 100,
          inflectionPrice: precision.token(1),
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

    const spaceEthBalance0 = await ethers.provider.getBalance(spaceAddr)

    const {
      priceAfterFee: buyPriceAfterFee,
      price: buyPrice,
      creatorFee,
      appFee,
      protocolFee,
    } = await f.indieX.getBuyPriceAfterFee(creation.id, amount, creation.appId)

    const tx1 = await f.indieX.connect(f.user1).buy(creation.id, amount, ZeroAddress, { value: buyPriceAfterFee })
    await tx1.wait()

    const spaceEthBalance1 = await ethers.provider.getBalance(spaceAddr)
    expect(spaceEthBalance1 - spaceEthBalance0).to.equal(creatorFee)

    const { priceAfterFee: buyPriceAfterFee2, creatorFee: creatorFee2 } = await f.indieX.getBuyPriceAfterFee(
      creation.id,
      amount,
      creation.appId,
    )

    const tx2 = await f.indieX.connect(f.user1).buy(creation.id, amount, ZeroAddress, { value: buyPriceAfterFee2 })
    await tx2.wait()

    const spaceEthBalance2 = await ethers.provider.getBalance(spaceAddr)
    expect(spaceEthBalance2 - spaceEthBalance1).to.equal(creatorFee2)
  })
})

async function getSpace(addr: string) {
  return ethers.getContractAt('Space', addr) as any as Promise<Space>
}
