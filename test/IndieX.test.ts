import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'

describe('IndieX', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  async function newApp() {
    const tx = await f.indieX.newApp({
      name: 'Test App',
      dataURI: '',
      feeTo: f.deployer,
      appFeePercent: precision.token(2, 16),
      creatorFeePercent: precision.token(5, 16),
    })
    await tx.wait()
  }

  it('Deploy', async () => {
    const appIndex = await f.indieX.appIndex()
    expect(appIndex).to.equal(1n)

    const app = await f.indieX.apps(appIndex - 1n)
    expect(app.id).to.equal(appIndex - 1n)
    expect(app.name).to.equal('Genesis App')
    expect(app.feeTo).to.equal(f.deployer.address)
    expect(app.appFeePercent).to.equal(0n)
    expect(app.creatorFeePercent).to.equal(precision.token(5, 16))
  })

  it.only('New App', async () => {
    await expect(
      f.indieX.newApp({
        name: 'Test App',
        dataURI: '',
        feeTo: f.deployer,
        appFeePercent: precision.token(2, 16),
        creatorFeePercent: precision.token(5, 16),
      }),
    )
      .to.emit(f.indieX, 'NewApp')
      .withArgs(1n, f.deployer, 'Test App', '', f.deployer, precision.token(2, 16), precision.token(5, 16))

    const appIndex = await f.indieX.appIndex()
    expect(appIndex).to.equal(2n)

    const app = await f.indieX.apps(appIndex - 1n)
    expect(app.id).to.equal(appIndex - 1n)
    expect(app.name).to.equal('Test App')
    expect(app.feeTo).to.equal(f.deployer.address)
    expect(app.appFeePercent).to.equal(precision.token(2, 16))
    expect(app.creatorFeePercent).to.equal(precision.token(5, 16))
  })

  it('New Creation', async () => {
    return
    const amount = precision.token(1)

    const tx1 = await f.indieX.connect(f.user0).create()
    await tx1.wait()

    const creation = await f.indieX.getUserLatestCreation(f.user0.address)

    const user0Balance0 = await ethers.provider.getBalance(f.user0.address)

    const buyPrice = await f.indieX.getBuyPrice(creation.id, amount)

    // console.log('=====buyprice:', buyPrice, precision.toTokenDecimal(buyPrice))

    const tx2 = await f.indieX.connect(f.user0).buy(creation.id, amount, {
      value: buyPrice,
    })

    await tx2.wait()

    const user0Balance1 = await ethers.provider.getBalance(f.user0.address)

    console.log('=>>>>>>>>user0Balance1 - user0Balance0:', user0Balance1 - user0Balance0)

    expect(user0Balance1 - user0Balance0 + buyPrice).to.lessThan(0)

    {
      const balance = await ethers.provider.getBalance(f.indieXAddress)
      expect(balance).to.equal(0)
    }

    {
      const balance = await ethers.provider.getBalance(f.blankFarmerAddress)
      expect(balance).to.equal(buyPrice)
    }

    // const sellPrice = await f.factory.getSellPrice(creation.id, amount)

    {
      const balance = await ethers.provider.getBalance(f.blankFarmerAddress)
    }

    const tx3 = await f.indieX.connect(f.user0).sell(creation.id, amount)
    await tx3.wait()

    {
      const balance = await ethers.provider.getBalance(f.indieXAddress)
      expect(balance).to.equal(0)
    }

    {
      const balance = await ethers.provider.getBalance(f.blankFarmerAddress)

      expect(balance).to.equal(0)
    }

    const user0Balance2 = await ethers.provider.getBalance(f.user0.address)

    expect(user0Balance2 - user0Balance1).to.greaterThan(0)
  })
})
