import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { getSpace, getTokenAmount } from './utils'
import { ethers } from 'hardhat'

describe('spaceFactory', function () {
  let f: Fixture

  const price = precision.token('0.01024')

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('setPrice()', async () => {
    expect(await f.spaceFactory.price()).to.equal(price)

    await expect(f.spaceFactory.connect(f.user0).setPrice(precision.token(1))).to.revertedWithCustomError(
      f.spaceFactory,
      'OwnableUnauthorizedAccount',
    )

    const tx = await f.spaceFactory.connect(f.deployer).setPrice(precision.token(1))
    await tx.wait()

    expect(await f.spaceFactory.price()).to.equal(precision.token(1))
  })

  it('create()', async () => {
    const spaceName = 'TEST'

    const index0 = await f.spaceFactory.spaceIndex()
    expect(index0).to.equal(0n)

    // Insufficient payment
    await expect(f.spaceFactory.connect(f.user1).createSpace(spaceName, 'TEST', 0, { value: 0 })).to.revertedWith(
      'Insufficient payment',
    )

    const tx0 = await f.spaceFactory.connect(f.user1).createSpace(spaceName, 'TEST', 0, { value: price })
    await tx0.wait()

    const index1 = await f.spaceFactory.spaceIndex()
    expect(index1).to.equal(1n)

    const space = await f.spaceFactory.getUserLatestSpace(f.user1.address)
    expect(space.name).to.equal(spaceName)

    const spaces = await f.spaceFactory.getUserSpaces(f.user1.address)
    const userSpace = await f.spaceFactory.spaces(0n)

    expect(spaces.length).to.equal(1)
    expect(spaces[0]).to.equal(userSpace)

    /** create after setPrice */
    const tx1 = await f.spaceFactory.connect(f.deployer).setPrice(precision.token(1))
    await tx1.wait()

    await expect(f.spaceFactory.connect(f.user1).createSpace(spaceName, 'TEST', 0, { value: price })).to.revertedWith(
      'Insufficient payment',
    )

    const tx2 = await f.spaceFactory.connect(f.user1).createSpace(spaceName, 'TEST', 0, { value: precision.token(1) })
    await tx2.wait()

    {
      const spaces = await f.spaceFactory.getUserSpaces(f.user1.address)
      const userSpace = await f.spaceFactory.spaces(1n)

      expect(spaces.length).to.equal(2)
      expect(spaces[1]).to.equal(userSpace)
    }
  })

  it('create with pre-buy', async () => {
    const preBuyEthAmount = precision.token('0.1')

    await expect(
      f.spaceFactory.connect(f.user1).createSpace('Test', 'TEST', preBuyEthAmount, { value: price }),
    ).to.revertedWith('Insufficient payment')

    const tx0 = await f.spaceFactory
      .connect(f.user1)
      .createSpace('Test', 'TEST', preBuyEthAmount, { value: price + preBuyEthAmount })
    await tx0.wait()

    const spaceAddr = await f.spaceFactory.spaces(0n)
    const space = await getSpace(spaceAddr)

    const factoryEthBalance1 = await ethers.provider.getBalance(f.spaceFactoryAddr)
    const spaceEthBalance1 = await ethers.provider.getBalance(spaceAddr)

    expect(factoryEthBalance1).to.equal(price)
    expect(spaceEthBalance1).to.equal(precision.token(0.1))

    const factoryTokenBalance1 = await space.balanceOf(f.spaceFactoryAddr)
    const user1TokenBalance1 = await space.balanceOf(f.user1.address)
    const spaceTokenBalance1 = await space.balanceOf(spaceAddr)

    const { protocolFee, tokenAmountAfterFee, creatorFee, insuranceFee } = getTokenAmount(
      precision.token(30),
      precision.token(1073000191),
      precision.token(30) * precision.token(1073000191),
      preBuyEthAmount,
    )

    const supply = await space.totalSupply()

    expect(supply).to.equal(spaceTokenBalance1 + user1TokenBalance1 + factoryTokenBalance1)

    expect(factoryTokenBalance1).to.equal(protocolFee)
    expect(user1TokenBalance1).to.equal(tokenAmountAfterFee)
    expect(spaceTokenBalance1).to.equal(creatorFee)
  })
})
