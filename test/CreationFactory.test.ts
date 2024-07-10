import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'

describe('CreationFactory', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it.only('create', async () => {
    const amount = precision.token(1)
    const tx1 = await f.factory.connect(f.user0).create({
      name: 'Test Creation',
      description: 'Test Creation',
      curve: 0,
      farmer: 0,
    })
    await tx1.wait()

    const creation = await f.factory.getUserLatestCreation(f.user0.address)

    const user0Balance0 = await ethers.provider.getBalance(f.user0.address)

    const buyPrice = await f.factory.getBuyPrice(creation.id, amount)

    // console.log('=====buyprice:', buyPrice, precision.toTokenDecimal(buyPrice))

    const tx2 = await f.factory.connect(f.user0).buy(creation.id, amount, {
      value: buyPrice,
    })

    await tx2.wait()

    const user0Balance1 = await ethers.provider.getBalance(f.user0.address)

    console.log('=>>>>>>>>user0Balance1 - user0Balance0:', user0Balance1 - user0Balance0)

    expect(user0Balance1 - user0Balance0 + buyPrice).to.lessThan(0)

    {
      const balance = await ethers.provider.getBalance(f.factoryAddress)
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

    const tx3 = await f.factory.connect(f.user0).sell(creation.id, amount)
    await tx3.wait()

    {
      const balance = await ethers.provider.getBalance(f.factoryAddress)
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
