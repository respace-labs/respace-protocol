import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { buy, createSpace, getSpace, getTokenAmount, initialK, initialX, initialY, PREMINT_ETH_AMOUNT } from './utils'
import { ethers } from 'hardhat'
import { ZeroAddress } from 'ethers'

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

  it('setFeeReceiver()', async () => {
    expect(await f.spaceFactory.feeReceiver()).to.equal(ZeroAddress)

    await expect(f.spaceFactory.connect(f.user9).setFeeReceiver(f.user8.address)).to.revertedWithCustomError(
      f.spaceFactory,
      'OwnableUnauthorizedAccount',
    )

    const tx = await f.spaceFactory.connect(f.deployer).setFeeReceiver(f.user8.address)
    await tx.wait()

    expect(await f.spaceFactory.feeReceiver()).to.equal(f.user8.address)
  })

  it('create()', async () => {
    const spaceName = 'TEST'

    const index0 = await f.spaceFactory.spaceIndex()
    expect(index0).to.equal(0n)

    // Insufficient payment
    await expect(f.spaceFactory.connect(f.user1).createSpace(0, spaceName, 'TEST', 0, { value: 0 })).to.revertedWith(
      'Insufficient payment',
    )

    const tx0 = await f.spaceFactory.connect(f.user1).createSpace(0, spaceName, 'TEST', 0, { value: price })
    await tx0.wait()

    const index1 = await f.spaceFactory.spaceIndex()
    expect(index1).to.equal(1n)

    const spaces = await f.spaceFactory.getUserSpaces(f.user1.address)

    const userSpace = await f.spaceFactory.spaces(0n)

    expect(spaces.length).to.equal(1)
    expect(spaces[0]).to.equal(userSpace)

    // Check spaceToFounder mapping
    const founder = await f.spaceFactory.spaceToFounder(userSpace)
    expect(founder).to.equal(f.user1.address)

    /** create after setPrice */
    const tx1 = await f.spaceFactory.connect(f.deployer).setPrice(precision.token(1))
    await tx1.wait()

    await expect(
      f.spaceFactory.connect(f.user1).createSpace(0, spaceName, 'TEST', 0, { value: price }),
    ).to.revertedWith('Insufficient payment')

    const tx2 = await f.spaceFactory
      .connect(f.user1)
      .createSpace(0, spaceName, 'TEST', 0, { value: precision.token(1) })
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
      f.spaceFactory.connect(f.user1).createSpace(0, 'Test', 'TEST', preBuyEthAmount, { value: price }),
    ).to.revertedWith('Insufficient payment')

    const tx0 = await f.spaceFactory
      .connect(f.user1)
      .createSpace(0, 'Test', 'TEST', preBuyEthAmount, { value: price + preBuyEthAmount })
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

    const supply = await space.totalSupply()
    const { tokenAmount: premint, newX, newY, newK } = getTokenAmount(initialX, initialY, initialK, PREMINT_ETH_AMOUNT)

    const { protocolFee, tokenAmountAfterFee, creatorFee } = getTokenAmount(newX, newY, newK, preBuyEthAmount)

    expect(supply).to.equal(spaceTokenBalance1 + user1TokenBalance1 + factoryTokenBalance1)

    expect(factoryTokenBalance1).to.equal(protocolFee + creatorFee)
    expect(user1TokenBalance1).to.equal(tokenAmountAfterFee)
    expect(spaceTokenBalance1).to.equal(premint)
  })

  it('withdrawEther()', async () => {
    const balance0 = await ethers.provider.getBalance(f.spaceFactoryAddr)
    expect(balance0).to.equal(0n)

    const tx0 = await f.user0.sendTransaction({
      to: f.spaceFactoryAddr,
      value: precision.token(1),
    })
    await tx0.wait()

    const balance1 = await ethers.provider.getBalance(f.spaceFactoryAddr)
    expect(balance1).to.equal(precision.token(1))

    await expect(f.spaceFactory.withdrawEther()).to.revertedWith('Invalid address')

    await expect(f.spaceFactory.connect(f.user1).withdrawEther()).to.revertedWithCustomError(
      f.spaceFactory,
      'OwnableUnauthorizedAccount',
    )

    const user8Balance0 = await ethers.provider.getBalance(f.user8.address)

    const tx = await f.spaceFactory.connect(f.deployer).setFeeReceiver(f.user8.address)
    await tx.wait()

    const tx1 = await f.spaceFactory.withdrawEther()
    await tx1.wait()

    const user8Balance1 = await ethers.provider.getBalance(f.user8.address)
    expect(user8Balance1 - user8Balance0).to.equal(precision.token(1))
  })

  it('withdrawTokens()', async () => {
    const { space: space1, spaceAddr: spaceAddr1 } = await createSpace(f, f.user0, 'SPACE1')
    const { space: space2, spaceAddr: spaceAddr2 } = await createSpace(f, f.user0, 'SPACE2')

    const space1Balance0 = await space1.balanceOf(f.spaceFactoryAddr)
    const space2Balance0 = await space1.balanceOf(f.spaceFactoryAddr)
    expect(space1Balance0).to.equal(0n)
    expect(space2Balance0).to.equal(0n)

    const buyInfo1 = await buy(space1, f.user1, precision.token(1))
    const buyInfo2 = await buy(space2, f.user1, precision.token(2))

    const space1Balance1 = await space1.balanceOf(f.spaceFactoryAddr)
    const space2Balance1 = await space2.balanceOf(f.spaceFactoryAddr)
    expect(space1Balance1).to.equal(buyInfo1.protocolFee)
    expect(space2Balance1).to.equal(buyInfo2.protocolFee)

    const tx0 = await f.spaceFactory.connect(f.deployer).setFeeReceiver(f.user3.address)
    await tx0.wait()

    const receiver = f.user3.address

    const receiverSpace1Balance0 = await space1.balanceOf(receiver)
    const receiverSpace2Balance0 = await space2.balanceOf(receiver)
    expect(receiverSpace1Balance0).to.equal(0)
    expect(receiverSpace2Balance0).to.equal(0)

    const tx1 = await f.spaceFactory.connect(f.deployer).withdrawTokens([spaceAddr1, spaceAddr2])
    await tx1.wait()

    const space1Balance2 = await space1.balanceOf(f.spaceFactoryAddr)
    const space2Balance2 = await space1.balanceOf(f.spaceFactoryAddr)
    expect(space1Balance2).to.equal(0n)
    expect(space2Balance2).to.equal(0n)

    const receiverSpace1Balance1 = await space1.balanceOf(receiver)
    const receiverSpace2Balance1 = await space2.balanceOf(receiver)
    expect(receiverSpace1Balance1).to.equal(buyInfo1.protocolFee)
    expect(receiverSpace2Balance1).to.equal(buyInfo2.protocolFee)
  })

  it('isRegisteredSpace()', async () => {
    const { spaceAddr } = await createSpace(f, f.user0, 'SPACE1')

    expect(await f.spaceFactory.isSpace(spaceAddr)).to.be.true
    expect(await f.spaceFactory.isSpace(f.user0.address)).to.be.false
  })
})
