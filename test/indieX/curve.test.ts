import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'

describe('Test buy()', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  async function newApp() {
    const tx = await f.indieX.connect(f.user9).newApp({
      name: 'Test App',
      uri: '',
      feeTo: f.deployer,
      appFeePercent: precision.token(2, 16),
      creatorFeePercent: precision.token(5, 16),
    })
    await tx.wait()
  }

  it('Buy curve for Space', async () => {
    const arr = Array(100)
      .fill(0)
      .map((_, i) => i + 1)

    await newApp()

    const amount = precision.token(1)
    const tx1 = await f.indieX.connect(f.user0).newCreation({
      name: 'Test Creation',
      uri: '',
      appId: 1n,
      curatorFeePercent: precision.token(30, 16),
      farmer: 0n,
      isFarming: false,
      curve: 0n,
      curveArgs: [precision.token(1, 18)],
    })

    await tx1.wait()
    const creation = await f.indieX.getUserLatestCreation(f.user0.address)
    const app = await f.indieX.apps(creation.appId)

    for (const i of arr) {
      const {
        priceAfterFee: buyPriceAfterFee,
        price: buyPrice,
        creatorFee,
        appFee,
      } = await f.indieX.getBuyPriceAfterFee(creation.id, amount, creation.appId)
      console.log('=====buyPrice:', i, buyPrice, precision.toTokenDecimal(buyPrice))

      const tx2 = await f.indieX.connect(f.user1).buy(creation.id, amount, ZeroAddress, { value: buyPriceAfterFee })
    }

    //
  })

  it('Buy curve for post', async () => {
    const arr = Array(100)
      .fill(0)
      .map((_, i) => i + 1)

    await newApp()

    const amount = precision.token(1)
    const tx1 = await f.indieX.connect(f.user0).newCreation({
      name: 'Test Creation',
      uri: '',
      appId: 1n,
      curatorFeePercent: precision.token(30, 16),
      farmer: 0n,
      isFarming: false,
      curve: 0n,
      curveArgs: [precision.token(1, 18)],
    })

    await tx1.wait()
    const creation = await f.indieX.getUserLatestCreation(f.user0.address)
    const app = await f.indieX.apps(creation.appId)

    for (const i of arr) {
      const {
        priceAfterFee: buyPriceAfterFee,
        price: buyPrice,
        creatorFee,
        appFee,
      } = await f.indieX.getBuyPriceAfterFee(creation.id, amount, creation.appId)
      console.log('=====buyPrice:', i, buyPrice, precision.toTokenDecimal(buyPrice))

      const tx2 = await f.indieX.connect(f.user1).buy(creation.id, amount, ZeroAddress, { value: buyPriceAfterFee })
    }

    //
  })
})
