import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { IndieX } from 'types'

async function newApp(f: Fixture) {
  const tx = await f.indieX.connect(f.user9).newApp({
    name: 'Test App',
    uri: '',
    feeTo: f.deployer,
    appFeePercent: precision.token(2, 16),
    creatorFeePercent: precision.token(5, 16),
  })
  await tx.wait()
}

interface BuyParams {
  creationId: bigint
  amount: bigint
  account?: HardhatEthersSigner
  curator?: string
}

describe('Test sell()', function () {
  let f: Fixture
  let creation: IndieX.CreationStructOutput
  let app: IndieX.AppStructOutput

  async function buy(f: Fixture, params: BuyParams) {
    const { priceAfterFee: buyPriceAfterFee } = await f.indieX.getBuyPriceAfterFee(
      params.creationId,
      params.amount,
      creation.appId,
    )

    const tx2 = await f.indieX
      .connect(params.account || f.user1)
      .buy(params.creationId, params.amount, params.curator || ZeroAddress, { value: buyPriceAfterFee })
    await tx2.wait()
  }

  beforeEach(async () => {
    f = await deployFixture()

    const tx0 = await f.indieX.setProtocolFeeTo(f.user9)
    await tx0.wait()
    await newApp(f)
  })

  it('Sell with farming false', async () => {
    const amount = precision.token(1)

    const tx1 = await f.indieX.connect(f.user0).newCreation({
      name: 'Test Creation',
      uri: '',
      curatorFeePercent: precision.token(30, 16),
      appId: 1n,
      farmer: 0n,
      isFarming: false,
      curve: 0n,
      curveArgs: [],
    })

    await tx1.wait()

    creation = await f.indieX.getUserLatestCreation(f.user0.address)
    app = await f.indieX.getApp(creation.appId)

    const { priceAfterFee: buyPriceAfterFee, price: buyPrice } = await f.indieX.getBuyPriceAfterFee(
      creation.id,
      amount,
      creation.appId,
    )

    const tx2 = await f.indieX.connect(f.user1).buy(creation.id, amount, ZeroAddress, { value: buyPriceAfterFee })

    await tx2.wait()

    {
      const creationAfter = await f.indieX.getUserLatestCreation(f.user0.address)
      expect(creationAfter.balance - creation.balance).to.equal(buyPrice)
      expect(creationAfter.volume - creation.volume).to.equal(buyPrice)
    }

    const sellPriceGet = await f.indieX.getSellPrice(creation.id, amount)
    const {
      priceAfterFee: sellPriceAfterFee,
      price: sellPrice,
      creatorFee,
      appFee,
      protocolFee,
    } = await f.indieX.getSellPriceAfterFee(creation.id, amount, creation.appId)

    expect((sellPriceGet * 2n) / 100n).to.equal(appFee)
    expect((sellPriceGet * 5n) / 100n).to.equal(creatorFee)
    expect((sellPriceGet * 1n) / 100n).to.equal(protocolFee)

    expect(sellPriceGet).to.equal(sellPrice)
    expect(sellPriceAfterFee).to.equal(sellPrice - creatorFee - appFee - protocolFee)
    expect(buyPrice).to.equal(sellPrice)

    const appBalance0 = await ethers.provider.getBalance(app.feeTo)
    const user0Balance0 = await ethers.provider.getBalance(f.user0.address)
    const user1Balance0 = await ethers.provider.getBalance(f.user1.address)
    const protocolFeeToBalance0 = await ethers.provider.getBalance(f.user9.address)
    const indieXBalance0 = await ethers.provider.getBalance(f.indieXAddress)
    const farmerBalance0 = await ethers.provider.getBalance(f.blankFarmerAddress)
    const supply0 = await f.indieX.creationSupply(creation.id)

    const tx3 = await f.indieX.connect(f.user1).sell(creation.id, amount)

    await tx3.wait()

    const appBalance1 = await ethers.provider.getBalance(app.feeTo)
    const user0Balance1 = await ethers.provider.getBalance(f.user0.address)
    const protocolFeeToBalance1 = await ethers.provider.getBalance(f.user9.address)
    const indieXBalance1 = await ethers.provider.getBalance(f.indieXAddress)
    const farmerBalance1 = await ethers.provider.getBalance(f.blankFarmerAddress)
    const user1Balance1 = await ethers.provider.getBalance(f.user1.address)
    const supply1 = await f.indieX.creationSupply(creation.id)

    expect(appBalance1 - appBalance0).to.equal(appFee)
    expect(user0Balance1 - user0Balance0).to.equal(creatorFee)
    expect(protocolFeeToBalance1 - protocolFeeToBalance0).to.equal(protocolFee)

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
    const amount = precision.token(1)

    const tx1 = await f.indieX.connect(f.user0).newCreation({
      name: 'Test Creation',
      uri: '',
      curatorFeePercent: precision.token(30, 16),
      appId: 1n,
      farmer: 0n,
      isFarming: true,
      curve: 0n,
      curveArgs: [],
    })

    await tx1.wait()

    creation = await f.indieX.getUserLatestCreation(f.user0.address)
    app = await f.indieX.getApp(creation.appId)

    const { priceAfterFee: buyPriceAfterFee, price: buyPrice } = await f.indieX.getBuyPriceAfterFee(
      creation.id,
      amount,
      creation.appId,
    )

    const tx2 = await f.indieX.connect(f.user1).buy(creation.id, amount, ZeroAddress, { value: buyPriceAfterFee })

    await tx2.wait()

    {
      const creationAfter = await f.indieX.getUserLatestCreation(f.user0.address)
      expect(creationAfter.balance - creation.balance).to.equal(buyPrice)
      expect(creationAfter.volume - creation.volume).to.equal(buyPrice)
    }

    const sellPriceGet = await f.indieX.getSellPrice(creation.id, amount)
    const {
      priceAfterFee: sellPriceAfterFee,
      price: sellPrice,
      creatorFee,
      appFee,
      protocolFee,
    } = await f.indieX.getSellPriceAfterFee(creation.id, amount, creation.appId)

    expect(sellPriceGet).to.equal(sellPrice)
    expect(sellPriceAfterFee).to.equal(sellPrice - creatorFee - appFee - protocolFee)
    expect(buyPrice).to.equal(sellPrice)

    const appBalance0 = await ethers.provider.getBalance(app.feeTo)
    const user0Balance0 = await ethers.provider.getBalance(f.user0.address)
    const protocolFeeToBalance0 = await ethers.provider.getBalance(f.user9.address)
    const user1Balance0 = await ethers.provider.getBalance(f.user1.address)
    const indieXBalance0 = await ethers.provider.getBalance(f.indieXAddress)
    const farmerBalance0 = await ethers.provider.getBalance(f.blankFarmerAddress)
    const supply0 = await f.indieX.creationSupply(creation.id)

    const tx3 = await f.indieX.connect(f.user1).sell(creation.id, amount)

    await tx3.wait()

    const appBalance1 = await ethers.provider.getBalance(app.feeTo)
    const user0Balance1 = await ethers.provider.getBalance(f.user0.address)
    const protocolFeeToBalance1 = await ethers.provider.getBalance(f.user9.address)
    const indieXBalance1 = await ethers.provider.getBalance(f.indieXAddress)
    const farmerBalance1 = await ethers.provider.getBalance(f.blankFarmerAddress)
    const user1Balance1 = await ethers.provider.getBalance(f.user1.address)
    const supply1 = await f.indieX.creationSupply(creation.id)

    expect(appBalance1 - appBalance0).to.equal(appFee)
    expect(user0Balance1 - user0Balance0).to.equal(creatorFee)
    expect(protocolFeeToBalance1 - protocolFeeToBalance0).to.equal(protocolFee)

    const user1Balance = await f.indieX.balanceOf(f.user1, creation.id)
    expect(user1Balance).to.equal(0)

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

  it('Only can Sell own amount', async () => {
    const amount = precision.token(1)

    const tx1 = await f.indieX.connect(f.user0).newCreation({
      name: 'Test Creation',
      uri: '',
      curatorFeePercent: precision.token(30, 16),
      appId: 1n,
      farmer: 0n,
      isFarming: true,
      curve: 0n,
      curveArgs: [],
    })

    await tx1.wait()

    creation = await f.indieX.getUserLatestCreation(f.user0.address)
    app = await f.indieX.getApp(creation.appId)

    await buy(f, {
      account: f.user1,
      creationId: creation.id,
      amount,
    })

    await expect(f.indieX.connect(f.user2).sell(creation.id, amount)).to.revertedWith('Insufficient amount')

    await expect(f.indieX.connect(f.user1).sell(creation.id, amount)).not.to.revertedWith('Insufficient amount')
  })

  it('Amount should below premint amount', async () => {
    const amount = precision.token(1)

    const tx1 = await f.indieX.connect(f.user0).newCreation({
      name: 'Test Creation',
      uri: '',
      curatorFeePercent: precision.token(30, 16),
      appId: 1n,
      farmer: 0n,
      isFarming: true,
      curve: 0n,
      curveArgs: [],
    })

    await tx1.wait()

    creation = await f.indieX.getUserLatestCreation(f.user0.address)
    app = await f.indieX.getApp(creation.appId)

    await expect(f.indieX.connect(f.user0).sell(creation.id, amount)).to.revertedWith(
      'Amount should below premint amount',
    )

    await buy(f, {
      account: f.user1,
      creationId: creation.id,
      amount,
    })

    await f.indieX.connect(f.user0).sell(creation.id, amount)

    await expect(f.indieX.connect(f.user0).sell(creation.id, amount)).to.revertedWith('Insufficient amount')

    await expect(f.indieX.connect(f.user1).sell(creation.id, amount)).to.revertedWith(
      'Amount should below premint amount',
    )
  })

  it('Creation not existed', async () => {
    const amount = precision.token(1)

    const tx1 = await f.indieX.connect(f.user0).newCreation({
      name: 'Test Creation',
      uri: '',
      curatorFeePercent: precision.token(30, 16),
      appId: 1n,
      farmer: 0n,
      isFarming: true,
      curve: 0n,
      curveArgs: [],
    })

    await tx1.wait()

    creation = await f.indieX.getUserLatestCreation(f.user0.address)
    app = await f.indieX.getApp(creation.appId)

    await buy(f, {
      account: f.user1,
      creationId: creation.id,
      amount,
    })

    await expect(f.indieX.connect(f.user1).sell(creation.id + 1n, amount)).to.revertedWith('Creation not existed')
  })
})
