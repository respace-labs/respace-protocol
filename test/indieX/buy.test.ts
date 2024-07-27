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

  it('Buy with farm false', async () => {
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
      curveArgs: [],
    })

    await tx1.wait()

    const creation = await f.indieX.getUserLatestCreation(f.user0.address)
    const app = await f.indieX.apps(creation.appId)

    const appBalance0 = await ethers.provider.getBalance(app.feeTo)
    const user0Balance0 = await ethers.provider.getBalance(f.user0.address)
    const user1Balance0 = await ethers.provider.getBalance(f.user1.address)
    const indieXBalance0 = await ethers.provider.getBalance(f.indieXAddress)
    const farmerBalance0 = await ethers.provider.getBalance(f.blankFarmerAddress)
    const supply0 = await f.indieX.creationSupply(creation.id)

    expect(indieXBalance0).to.equal(0)
    expect(farmerBalance0).to.equal(0)
    expect(supply0).to.equal(await f.indieX.CREATOR_PREMINT())

    const buyPriceGet = await f.indieX.getBuyPrice(creation.id, amount)
    // console.log('=====buyPriceGet:', precision.toTokenDecimal(buyPriceGet))

    const [buyPriceAfterFee, buyPrice, creatorFee, appFee] = await f.indieX.getBuyPriceAfterFee(
      creation.id,
      amount,
      creation.appId,
    )

    expect(buyPriceGet).to.equal(buyPrice)
    expect(buyPriceAfterFee).to.equal(buyPrice + creatorFee + appFee)

    const tx2 = await f.indieX.connect(f.user1).buy(creation.id, amount, ZeroAddress, { value: buyPriceAfterFee })

    await tx2.wait()

    const appBalance1 = await ethers.provider.getBalance(app.feeTo)
    const user0Balance1 = await ethers.provider.getBalance(f.user0.address)
    const user1Balance1 = await ethers.provider.getBalance(f.user1.address)
    const indieXBalance1 = await ethers.provider.getBalance(f.indieXAddress)
    const farmerBalance1 = await ethers.provider.getBalance(f.blankFarmerAddress)
    const supply1 = await f.indieX.creationSupply(creation.id)

    expect(appBalance1 - appBalance0).to.equal(appFee)
    expect(user0Balance1 - user0Balance0).to.equal(creatorFee)
    expect(user1Balance1 - user1Balance0 + buyPrice).to.lessThan(0)

    const userBalance = await f.indieX.balanceOf(f.user1, creation.id)
    expect(userBalance).to.equal(amount)

    expect(indieXBalance1).to.equal(buyPrice)
    expect(indieXBalance1 - indieXBalance0).to.equal(buyPrice)
    expect(farmerBalance1).to.equal(0)
    expect(supply1 - supply0).to.equal(amount)

    const creationAfter = await f.indieX.getUserLatestCreation(f.user0.address)
    expect(creationAfter.balance - creation.balance).to.equal(buyPrice)
    expect(creationAfter.volume - creation.volume).to.equal(buyPrice)
  })

  it('Buy with farming true', async () => {
    await newApp()

    const amount = precision.token(1)
    const tx1 = await f.indieX.connect(f.user0).newCreation({
      name: 'Test Creation',
      uri: '',
      appId: 1n,
      curatorFeePercent: precision.token(30, 16),
      farmer: 0n,
      isFarming: true,
      curve: 0n,
      curveArgs: [],
    })

    await tx1.wait()

    const creation = await f.indieX.getUserLatestCreation(f.user0.address)
    const app = await f.indieX.apps(creation.appId)

    const appBalance0 = await ethers.provider.getBalance(app.feeTo)
    const user0Balance0 = await ethers.provider.getBalance(f.user0.address)
    const user1Balance0 = await ethers.provider.getBalance(f.user1.address)
    const indieXBalance0 = await ethers.provider.getBalance(f.indieXAddress)
    const farmerBalance0 = await ethers.provider.getBalance(f.blankFarmerAddress)
    const supply0 = await f.indieX.creationSupply(creation.id)

    expect(indieXBalance0).to.equal(0)
    expect(farmerBalance0).to.equal(0)
    expect(supply0).to.equal(await f.indieX.CREATOR_PREMINT())

    const buyPriceGet = await f.indieX.getBuyPrice(creation.id, amount)
    // console.log('=====buyPriceGet:', precision.toTokenDecimal(buyPriceGet))

    const [buyPriceAfterFee, buyPrice, creatorFee, appFee] = await f.indieX.getBuyPriceAfterFee(
      creation.id,
      amount,
      creation.appId,
    )

    expect(buyPriceGet).to.equal(buyPrice)
    expect(buyPriceAfterFee).to.equal(buyPrice + creatorFee + appFee)

    const tx2 = await f.indieX.connect(f.user1).buy(creation.id, amount, ZeroAddress, { value: buyPriceAfterFee })

    await tx2.wait()

    const appBalance1 = await ethers.provider.getBalance(app.feeTo)
    const user0Balance1 = await ethers.provider.getBalance(f.user0.address)
    const user1Balance1 = await ethers.provider.getBalance(f.user1.address)
    const indieXBalance1 = await ethers.provider.getBalance(f.indieXAddress)
    const farmerBalance1 = await ethers.provider.getBalance(f.blankFarmerAddress)

    const supply1 = await f.indieX.creationSupply(creation.id)

    expect(appBalance1 - appBalance0).to.equal(appFee)
    expect(user0Balance1 - user0Balance0).to.equal(creatorFee)
    expect(user1Balance1 - user1Balance0 + buyPrice).to.lessThan(0)

    const userBalance = await f.indieX.balanceOf(f.user1, creation.id)
    expect(userBalance).to.equal(amount)

    expect(indieXBalance1).to.equal(0)
    expect(indieXBalance1 - indieXBalance0).to.equal(0)
    expect(farmerBalance1).to.equal(buyPrice)
    expect(farmerBalance1 - farmerBalance0).to.equal(buyPrice)
    expect(supply1 - supply0).to.equal(amount)

    const creationAfter = await f.indieX.getUserLatestCreation(f.user0.address)
    expect(creationAfter.balance - creation.balance).to.equal(buyPrice)
    expect(creationAfter.volume - creation.volume).to.equal(buyPrice)
  })

  it('Test refund', async () => {
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
      curveArgs: [],
    })

    await tx1.wait()

    const creation = await f.indieX.getUserLatestCreation(f.user0.address)

    const [buyPriceAfterFee, buyPrice, creatorFee, appFee] = await f.indieX.getBuyPriceAfterFee(
      creation.id,
      amount,
      creation.appId,
    )

    const tx2 = await f.indieX.connect(f.user1).buy(creation.id, amount, ZeroAddress, { value: buyPriceAfterFee * 2n })

    await tx2.wait()

    const indieXBalance = await ethers.provider.getBalance(f.indieXAddress)
    expect(indieXBalance).to.be.equal(buyPrice)
  })

  it.only('Buy with curator', async () => {
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
      curveArgs: [],
    })

    await tx1.wait()

    const creation = await f.indieX.getUserLatestCreation(f.user0.address)
    const app = await f.indieX.apps(creation.appId)

    const appBalance0 = await ethers.provider.getBalance(app.feeTo)
    const user0Balance0 = await ethers.provider.getBalance(f.user0.address)
    const user1Balance0 = await ethers.provider.getBalance(f.user1.address)
    const user2Balance0 = await ethers.provider.getBalance(f.user2.address)
    const indieXBalance0 = await ethers.provider.getBalance(f.indieXAddress)
    const farmerBalance0 = await ethers.provider.getBalance(f.blankFarmerAddress)
    const supply0 = await f.indieX.creationSupply(creation.id)

    expect(indieXBalance0).to.equal(0)
    expect(farmerBalance0).to.equal(0)
    expect(supply0).to.equal(await f.indieX.CREATOR_PREMINT())

    const buyPriceGet = await f.indieX.getBuyPrice(creation.id, amount)
    // console.log('=====buyPriceGet:', precision.toTokenDecimal(buyPriceGet))

    const [buyPriceAfterFee, buyPrice, creatorFee, appFee] = await f.indieX.getBuyPriceAfterFee(
      creation.id,
      amount,
      creation.appId,
    )

    expect(buyPriceGet).to.equal(buyPrice)
    expect(buyPriceAfterFee).to.equal(buyPrice + creatorFee + appFee)

    const tx2 = await f.indieX.connect(f.user1).buy(creation.id, amount, f.user2.address, { value: buyPriceAfterFee })

    await tx2.wait()

    const appBalance1 = await ethers.provider.getBalance(app.feeTo)
    const user0Balance1 = await ethers.provider.getBalance(f.user0.address)
    const user1Balance1 = await ethers.provider.getBalance(f.user1.address)
    const user2Balance1 = await ethers.provider.getBalance(f.user2.address)
    const indieXBalance1 = await ethers.provider.getBalance(f.indieXAddress)
    const farmerBalance1 = await ethers.provider.getBalance(f.blankFarmerAddress)
    const supply1 = await f.indieX.creationSupply(creation.id)

    expect(appBalance1 - appBalance0).to.equal(appFee)
    expect(user0Balance1 - user0Balance0).to.equal((creatorFee * 70n) / 100n) // 70% for the creator
    expect(user2Balance1 - user2Balance0).to.equal((creatorFee * 30n) / 100n) // 30% for the curator
    expect(user1Balance1 - user1Balance0 + buyPrice).to.lessThan(0)

    const userBalance = await f.indieX.balanceOf(f.user1, creation.id)
    expect(userBalance).to.equal(amount)

    expect(indieXBalance1).to.equal(buyPrice)
    expect(indieXBalance1 - indieXBalance0).to.equal(buyPrice)
    expect(farmerBalance1).to.equal(0)
    expect(supply1 - supply0).to.equal(amount)

    const creationAfter = await f.indieX.getUserLatestCreation(f.user0.address)
    expect(creationAfter.balance - creation.balance).to.equal(buyPrice)
    expect(creationAfter.volume - creation.volume).to.equal(buyPrice)
  })
})
