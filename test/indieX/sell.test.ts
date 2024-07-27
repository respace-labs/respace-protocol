import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'

describe('Test sell()', function () {
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

  it('Sell with farming false', async () => {
    await newApp()

    const amount = precision.token(1)
    const tx1 = await f.indieX.connect(f.user0).newCreation({
      name: 'Test Creation',
      uri: '',
      appId: 1n,
      farmer: 0n,
      isFarming: false,
      curve: 0n,
      curveArgs: [],
    })

    await tx1.wait()

    const creation = await f.indieX.getUserLatestCreation(f.user0.address)
    const app = await f.indieX.apps(creation.appId)

    const [buyPriceAfterFee, buyPrice] = await f.indieX.getBuyPriceAfterFee(creation.id, amount, creation.appId)

    const tx2 = await f.indieX.connect(f.user1).buy(creation.id, amount, { value: buyPriceAfterFee })

    await tx2.wait()

    {
      const creationAfter = await f.indieX.getUserLatestCreation(f.user0.address)
      expect(creationAfter.balance - creation.balance).to.equal(buyPrice)
      expect(creationAfter.volume - creation.volume).to.equal(buyPrice)
    }

    const sellPriceGet = await f.indieX.getSellPrice(creation.id, amount)
    const [sellPriceAfterFee, sellPrice, creatorFee, appFee] = await f.indieX.getSellPriceAfterFee(
      creation.id,
      amount,
      creation.appId,
    )

    expect(sellPriceGet).to.equal(sellPrice)
    expect(sellPriceAfterFee).to.equal(sellPrice - creatorFee - appFee)
    expect(buyPrice).to.equal(sellPrice)

    const appBalance0 = await ethers.provider.getBalance(app.feeTo)
    const user0Balance0 = await ethers.provider.getBalance(f.user0.address)
    const user1Balance0 = await ethers.provider.getBalance(f.user1.address)
    const indieXBalance0 = await ethers.provider.getBalance(f.indieXAddress)
    const farmerBalance0 = await ethers.provider.getBalance(f.blankFarmerAddress)
    const supply0 = await f.indieX.creationSupply(creation.id)

    const tx3 = await f.indieX.connect(f.user1).sell(creation.id, amount)

    await tx3.wait()

    const appBalance1 = await ethers.provider.getBalance(app.feeTo)
    const user0Balance1 = await ethers.provider.getBalance(f.user0.address)
    const indieXBalance1 = await ethers.provider.getBalance(f.indieXAddress)
    const farmerBalance1 = await ethers.provider.getBalance(f.blankFarmerAddress)
    const user1Balance1 = await ethers.provider.getBalance(f.user1.address)
    const supply1 = await f.indieX.creationSupply(creation.id)

    expect(appBalance1 - appBalance0).to.equal(appFee)
    expect(user0Balance1 - user0Balance0).to.equal(creatorFee)

    const userBalance = await f.indieX.balanceOf(f.user1, creation.id)
    expect(userBalance).to.equal(0)

    expect(indieXBalance1).to.equal(0)
    expect(indieXBalance1 - indieXBalance0).to.equal(-sellPrice)
    expect(farmerBalance1).to.equal(0)
    expect(supply1 - supply0).to.equal(-amount)

    {
      const creationAfter = await f.indieX.getUserLatestCreation(f.user0.address)
      expect(creationAfter.balance).to.equal(0)
      expect(creationAfter.balance - creation.balance).to.equal(0)
      expect(creationAfter.volume - creation.volume).to.equal(buyPrice + sellPrice)
    }
  })

  it('Sell with farming true', async () => {
    await newApp()

    const amount = precision.token(1)
    const tx1 = await f.indieX.connect(f.user0).newCreation({
      name: 'Test Creation',
      uri: '',
      appId: 1n,
      farmer: 0n,
      isFarming: true,
      curve: 0n,
      curveArgs: [],
    })

    await tx1.wait()

    const creation = await f.indieX.getUserLatestCreation(f.user0.address)
    const app = await f.indieX.apps(creation.appId)

    const [buyPriceAfterFee, buyPrice] = await f.indieX.getBuyPriceAfterFee(creation.id, amount, creation.appId)

    const tx2 = await f.indieX.connect(f.user1).buy(creation.id, amount, { value: buyPriceAfterFee })

    await tx2.wait()

    {
      const creationAfter = await f.indieX.getUserLatestCreation(f.user0.address)
      expect(creationAfter.balance - creation.balance).to.equal(buyPrice)
      expect(creationAfter.volume - creation.volume).to.equal(buyPrice)
    }

    const sellPriceGet = await f.indieX.getSellPrice(creation.id, amount)
    const [sellPriceAfterFee, sellPrice, creatorFee, appFee] = await f.indieX.getSellPriceAfterFee(
      creation.id,
      amount,
      creation.appId,
    )

    expect(sellPriceGet).to.equal(sellPrice)
    expect(sellPriceAfterFee).to.equal(sellPrice - creatorFee - appFee)
    expect(buyPrice).to.equal(sellPrice)

    const appBalance0 = await ethers.provider.getBalance(app.feeTo)
    const user0Balance0 = await ethers.provider.getBalance(f.user0.address)
    const user1Balance0 = await ethers.provider.getBalance(f.user1.address)
    const indieXBalance0 = await ethers.provider.getBalance(f.indieXAddress)
    const farmerBalance0 = await ethers.provider.getBalance(f.blankFarmerAddress)
    const supply0 = await f.indieX.creationSupply(creation.id)

    const tx3 = await f.indieX.connect(f.user1).sell(creation.id, amount)

    await tx3.wait()

    const appBalance1 = await ethers.provider.getBalance(app.feeTo)
    const user0Balance1 = await ethers.provider.getBalance(f.user0.address)
    const indieXBalance1 = await ethers.provider.getBalance(f.indieXAddress)
    const farmerBalance1 = await ethers.provider.getBalance(f.blankFarmerAddress)
    const user1Balance1 = await ethers.provider.getBalance(f.user1.address)
    const supply1 = await f.indieX.creationSupply(creation.id)

    expect(appBalance1 - appBalance0).to.equal(appFee)
    expect(user0Balance1 - user0Balance0).to.equal(creatorFee)

    const userBalance = await f.indieX.balanceOf(f.user1, creation.id)
    expect(userBalance).to.equal(0)

    expect(indieXBalance1).to.equal(0)
    expect(farmerBalance1).to.equal(0)
    expect(farmerBalance1 - farmerBalance0).to.equal(-sellPrice)
    expect(supply1 - supply0).to.equal(-amount)

    {
      const creationAfter = await f.indieX.getUserLatestCreation(f.user0.address)
      expect(creationAfter.balance).to.equal(0)
      expect(creationAfter.balance - creation.balance).to.equal(0)
      expect(creationAfter.volume - creation.volume).to.equal(buyPrice + sellPrice)
    }
  })
})
