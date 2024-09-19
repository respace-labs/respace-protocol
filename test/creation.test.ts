import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { createSpace } from './utils'

const mark = 'hello'

const GAS_PRICE = 800000000n

describe('Creation', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('setProtocolFeeTo', async () => {
    const feeTo0 = await f.creationFactory.protocolFeeTo()
    expect(feeTo0).to.equal(f.deployer.address)

    await expect(f.creationFactory.connect(f.user1).setProtocolFeeTo(f.user1.address)).to.revertedWithCustomError(
      f.creationFactory,
      'OwnableUnauthorizedAccount',
    )

    await f.creationFactory.connect(f.deployer).setProtocolFeeTo(f.user1.address)

    const feeTo1 = await f.creationFactory.protocolFeeTo()
    expect(feeTo1).to.equal(f.user1.address)
  })

  it('setFeePercent', async () => {
    const creatorFeePercent = await f.creationFactory.creatorFeePercent()
    const curatorFeePercent = await f.creationFactory.curatorFeePercent()
    const protocolFeePercent = await f.creationFactory.protocolFeePercent()

    expect(creatorFeePercent).to.equal(precision.token('0.5'))
    expect(curatorFeePercent).to.equal(precision.token('0.25'))
    expect(protocolFeePercent).to.equal(precision.token('0.25'))

    expect(creatorFeePercent + curatorFeePercent + protocolFeePercent).to.equal(precision.token(1))

    await expect(
      f.creationFactory
        .connect(f.user1)
        .setFeePercent(precision.token('0.4'), precision.token('0.4'), precision.token('0.1')),
    ).to.revertedWithCustomError(f.creationFactory, 'OwnableUnauthorizedAccount')

    await expect(
      f.creationFactory.setFeePercent(precision.token('0.4'), precision.token('0.4'), precision.token('0.1')),
    ).to.revertedWithCustomError(f.creationFactory, 'InvalidFeePercent')

    await f.creationFactory
      .connect(f.deployer)
      .setFeePercent(precision.token('0.4'), precision.token('0.4'), precision.token('0.2'))

    {
      const creatorFeePercent = await f.creationFactory.creatorFeePercent()
      const curatorFeePercent = await f.creationFactory.curatorFeePercent()
      const protocolFeePercent = await f.creationFactory.protocolFeePercent()

      expect(creatorFeePercent).to.equal(precision.token('0.4'))
      expect(curatorFeePercent).to.equal(precision.token('0.4'))
      expect(protocolFeePercent).to.equal(precision.token('0.2'))

      expect(creatorFeePercent + curatorFeePercent + protocolFeePercent).to.equal(precision.token(1))
    }
  })

  it('create', async () => {
    const price = precision.token('0.0001')
    const index0 = await f.creationFactory.creationIndex()
    expect(index0).to.equal(0)

    const supply0 = await f.creationFactory['totalSupply()']()
    expect(supply0).to.equal(0)

    const userCreations0 = await f.creationFactory.getUserCreations(f.user1.address)
    expect(userCreations0.length).to.equal(0)

    await expect(f.creationFactory.create(f.user0, 'Creation1', 0)).to.revertedWithCustomError(
      f.creationFactory,
      'PriceIsZero',
    )

    await expect(f.creationFactory.create(f.user0, '', price)).to.revertedWithCustomError(
      f.creationFactory,
      'URIIsEmpty',
    )

    await expect(f.creationFactory.connect(f.user1).create(f.user1, 'Creation 1', price))
      .to.emit(f.creationFactory, 'Created')
      .withArgs(0n, f.user1.address, 'Creation 1', price)

    const index1 = await f.creationFactory.creationIndex()
    expect(index1).to.equal(1)

    const latestCreation = await f.creationFactory.getUserLatestCreation(f.user1.address)

    expect(latestCreation.uri).to.equal('Creation 1')
    expect(latestCreation.price).to.equal(price)
    expect(latestCreation.creator).to.equal(f.user1.address)

    const userCreations1 = await f.creationFactory.getUserCreations(f.user1.address)
    expect(userCreations1.length).to.equal(1)
    expect(userCreations1[0]).to.equal(0)

    {
      const creation = await f.creationFactory.creations(0)
      expect(creation.uri).to.equal('Creation 1')
      expect(creation.price).to.equal(price)
      expect(creation.creator).to.equal(f.user1.address)
    }
  })

  it('update', async () => {
    const price = precision.token('0.0001')

    await expect(f.creationFactory.connect(f.user1).create(f.user1.address, 'Creation 1', price))
      .to.emit(f.creationFactory, 'Created')
      .withArgs(0n, f.user1.address, 'Creation 1', price)

    await expect(
      f.creationFactory.connect(f.user1).updateCreation(10n, 'Creation X', price * 2n),
    ).to.revertedWithCustomError(f.creationFactory, 'CreationNotFound')

    await expect(
      f.creationFactory.connect(f.user9).updateCreation(0n, 'Creation X', price * 2n),
    ).to.revertedWithCustomError(f.creationFactory, 'OnlyCreator')

    await expect(f.creationFactory.connect(f.user1).updateCreation(0, 'Creation updated', price * 2n))
      .to.emit(f.creationFactory, 'CreationUpdated')
      .withArgs(0n, f.user1.address, 'Creation updated', price * 2n)

    const creation = await f.creationFactory.creations(0)
    expect(creation.uri).to.equal('Creation updated')
    expect(creation.price).to.equal(price * 2n)
    expect(creation.creator).to.equal(f.user1.address)
  })

  it('mint()', async () => {
    const price = precision.token('0.0001')

    const tx0 = await f.creationFactory.connect(f.user1).create(f.user1.address, 'Creation 1', price)
    await tx0.wait()

    await expect(f.creationFactory.connect(f.user2).mint(0n, 0, ZeroAddress, mark)).to.revertedWithCustomError(
      f.creationFactory,
      'AmountIsZero',
    )

    await expect(f.creationFactory.connect(f.user2).mint(100n, 1, ZeroAddress, mark)).to.revertedWithCustomError(
      f.creationFactory,
      'CreationNotFound',
    )

    await expect(f.creationFactory.connect(f.user2).mint(0n, 1, ZeroAddress, mark)).to.revertedWithCustomError(
      f.creationFactory,
      'InsufficientPayment',
    )

    const deployerBalance0 = await ethers.provider.getBalance(f.deployer)
    const creatorBalance0 = await ethers.provider.getBalance(f.user1)

    const amount = 2n
    const creatorFee = (price * amount * 75n) / 100n
    const protocolFee = (price * amount * 25n) / 100n
    const curatorFee = 0n

    expect(creatorFee + protocolFee + curatorFee).to.equal(price * amount)

    // mint
    await expect(
      f.creationFactory.connect(f.user2).mint(0n, amount, ZeroAddress, mark, {
        value: price * amount,
      }),
    )
      .to.emit(f.creationFactory, 'Minted')
      .withArgs(0, f.user2.address, ZeroAddress, amount, mark)

    const supply1 = await f.creationFactory['totalSupply()']()
    expect(supply1).to.equal(amount)

    const creationSupply1 = await f.creationFactory.creationSupply(0)
    expect(creationSupply1).to.equal(amount)

    const ethAmount = await f.creationFactory.ethAmount()
    expect(ethAmount).to.equal(price * amount)

    const user2TokenBalance = await f.creationFactory.balanceOf(f.user2.address, 0n)
    expect(user2TokenBalance).to.equal(amount)

    const deployerBalance1 = await ethers.provider.getBalance(f.deployer)
    const creatorBalance1 = await ethers.provider.getBalance(f.user1)

    expect(deployerBalance1 - deployerBalance0).to.be.equal(protocolFee)
    expect(creatorBalance1 - creatorBalance0).to.be.equal(creatorFee)
  })

  it('mint() with curator', async () => {
    const price = precision.token('0.0001')

    const tx0 = await f.creationFactory.connect(f.user1).create(f.user1.address, 'Creation 1', price)
    await tx0.wait()

    const curator = f.user8
    const curatorAddr = f.user8.address

    const deployerBalance0 = await ethers.provider.getBalance(f.deployer)
    const creatorBalance0 = await ethers.provider.getBalance(f.user1)
    const curatorBalance0 = await ethers.provider.getBalance(curator)

    const mintId = generateMintId(0n, curatorAddr)
    const isValidCurator = await f.creationFactory.minted(mintId)
    console.log('===isValidCurator:', isValidCurator)

    const amount = 10n
    const { creatorFee, protocolFee, curatorFee } = calFee(price, amount, isValidCurator)

    expect(creatorFee + protocolFee + curatorFee).to.equal(price * amount)

    // mint
    await expect(
      f.creationFactory.connect(f.user2).mint(0n, 10, curatorAddr, mark, {
        value: price * 10n,
      }),
    )
      .to.emit(f.creationFactory, 'Minted')
      .withArgs(0, f.user2.address, curatorAddr, amount, mark)

    const supply1 = await f.creationFactory['totalSupply()']()
    expect(supply1).to.equal(amount)

    const creationSupply1 = await f.creationFactory.creationSupply(0)
    expect(creationSupply1).to.equal(amount)

    const ethAmount = await f.creationFactory.ethAmount()
    expect(ethAmount).to.equal(price * amount)

    const user2TokenBalance = await f.creationFactory.balanceOf(f.user2.address, 0n)
    expect(user2TokenBalance).to.equal(amount)

    const deployerBalance1 = await ethers.provider.getBalance(f.deployer)
    const creatorBalance1 = await ethers.provider.getBalance(f.user1)
    const curatorBalance1 = await ethers.provider.getBalance(curator)

    expect(deployerBalance1 - deployerBalance0).to.be.equal(protocolFee)
    expect(creatorBalance1 - creatorBalance0).to.be.equal(creatorFee)
    expect(curatorBalance1 - curatorBalance0).to.be.equal(curatorFee)
  })

  it('mint() with exceed eth', async () => {
    const price = precision.token('0.0001')

    const tx0 = await f.creationFactory.connect(f.user1).create(f.user1.address, 'Creation 1', price)
    await tx0.wait()

    const user2Balance0 = await ethers.provider.getBalance(f.user2)

    const tx1 = await f.creationFactory.connect(f.user2).mint(0n, 1, ZeroAddress, mark, {
      value: price,
      gasPrice: GAS_PRICE,
    })
    await tx1.wait()
    const receipt1: any = await tx1.wait()
    const gasUsed1 = receipt1.gasUsed as bigint
    const gasCost1 = gasUsed1 * GAS_PRICE

    const user2Balance1 = await ethers.provider.getBalance(f.user2)
    expect(user2Balance0 - user2Balance1).to.equal(gasCost1 + price)

    const tx2 = await f.creationFactory.connect(f.user2).mint(0n, 1, ZeroAddress, mark, {
      value: price * 10n,
      gasPrice: GAS_PRICE,
    })
    await tx2.wait()
    const receipt2: any = await tx2.wait()
    const gasUsed2 = receipt2.gasUsed as bigint
    const gasCost2 = gasUsed2 * GAS_PRICE

    const user2Balance2 = await ethers.provider.getBalance(f.user2)
    expect(user2Balance1 - user2Balance2).to.equal(gasCost2 + price)
  })

  it('update', async () => {
    const price = precision.token('0.0001')

    await expect(f.creationFactory.connect(f.user1).create(f.user1.address, 'Creation 1', price))
      .to.emit(f.creationFactory, 'Created')
      .withArgs(0n, f.user1.address, 'Creation 1', price)

    await expect(
      f.creationFactory.connect(f.user1).updateCreation(10n, 'Creation X', price * 2n),
    ).to.revertedWithCustomError(f.creationFactory, 'CreationNotFound')

    await expect(
      f.creationFactory.connect(f.user9).updateCreation(0n, 'Creation X', price * 2n),
    ).to.revertedWithCustomError(f.creationFactory, 'OnlyCreator')

    await expect(f.creationFactory.connect(f.user1).updateCreation(0, 'Creation updated', price * 2n))
      .to.emit(f.creationFactory, 'CreationUpdated')
      .withArgs(0n, f.user1.address, 'Creation updated', price * 2n)

    const creation = await f.creationFactory.creations(0)
    expect(creation.uri).to.equal('Creation updated')
    expect(creation.price).to.equal(price * 2n)
    expect(creation.creator).to.equal(f.user1.address)
  })

  it('mint()', async () => {
    const price = precision.token('0.0001')

    const tx0 = await f.creationFactory.connect(f.user1).create(f.user1.address, 'Creation 1', price)
    await tx0.wait()

    await expect(f.creationFactory.connect(f.user2).mint(0n, 0, ZeroAddress, mark)).to.revertedWithCustomError(
      f.creationFactory,
      'AmountIsZero',
    )

    await expect(f.creationFactory.connect(f.user2).mint(100n, 1, ZeroAddress, mark)).to.revertedWithCustomError(
      f.creationFactory,
      'CreationNotFound',
    )

    await expect(f.creationFactory.connect(f.user2).mint(0n, 1, ZeroAddress, mark)).to.revertedWithCustomError(
      f.creationFactory,
      'InsufficientPayment',
    )

    const deployerBalance0 = await ethers.provider.getBalance(f.deployer)
    const creatorBalance0 = await ethers.provider.getBalance(f.user1)

    const amount = 2n
    const creatorFee = (price * amount * 75n) / 100n
    const protocolFee = (price * amount * 25n) / 100n
    const curatorFee = 0n

    expect(creatorFee + protocolFee + curatorFee).to.equal(price * amount)

    // mint
    await expect(
      f.creationFactory.connect(f.user2).mint(0n, amount, ZeroAddress, mark, {
        value: price * amount,
      }),
    )
      .to.emit(f.creationFactory, 'Minted')
      .withArgs(0, f.user2.address, ZeroAddress, amount, mark)

    const supply1 = await f.creationFactory['totalSupply()']()
    expect(supply1).to.equal(amount)

    const creationSupply1 = await f.creationFactory.creationSupply(0)
    expect(creationSupply1).to.equal(amount)

    const ethAmount = await f.creationFactory.ethAmount()
    expect(ethAmount).to.equal(price * amount)

    const user2TokenBalance = await f.creationFactory.balanceOf(f.user2.address, 0n)
    expect(user2TokenBalance).to.equal(amount)

    const deployerBalance1 = await ethers.provider.getBalance(f.deployer)
    const creatorBalance1 = await ethers.provider.getBalance(f.user1)

    expect(deployerBalance1 - deployerBalance0).to.be.equal(protocolFee)
    expect(creatorBalance1 - creatorBalance0).to.be.equal(creatorFee)
  })
})

function generateMintId(creationId: bigint, account: string) {
  const abiCoder = new ethers.AbiCoder()
  const encodedData = abiCoder.encode(['uint256', 'address'], [creationId, account])

  const mintedId = ethers.keccak256(encodedData)
  return mintedId
}

function calFee(price: bigint, amount: bigint, isValidCurator: boolean) {
  if (isValidCurator) {
    const creatorFee = (price * amount * 50n) / 100n
    const protocolFee = (price * amount * 25n) / 100n
    const curatorFee = (price * amount * 25n) / 100n
    return {
      creatorFee,
      protocolFee,
      curatorFee,
    }
  } else {
    const creatorFee = (price * amount * 75n) / 100n
    const protocolFee = (price * amount * 25n) / 100n
    const curatorFee = (price * amount * 0n) / 100n
    return {
      creatorFee,
      protocolFee,
      curatorFee,
    }
  }
}
