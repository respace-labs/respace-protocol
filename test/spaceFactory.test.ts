import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { buy, createSpace } from './utils'
import { ethers } from 'hardhat'
import { ZeroAddress } from 'ethers'

const { keccak256, toUtf8Bytes } = ethers
const APP_ROLE = keccak256(toUtf8Bytes('APP_ROLE'))
const CONFIG_ROLE = keccak256(toUtf8Bytes('CONFIG_ROLE'))

describe('spaceFactory', function () {
  let f: Fixture

  const price = precision.token('0.01024')

  beforeEach(async () => {
    f = await deployFixture()

    // grant user8 to App role
    const tx0 = await f.spaceFactory.connect(f.deployer).grantRole(APP_ROLE, f.user8.address)
    await tx0.wait()

    // grant user9 to Config role
    const tx1 = await f.spaceFactory.connect(f.deployer).grantRole(CONFIG_ROLE, f.user9.address)
    await tx1.wait()
  })

  describe('AccessControl', () => {
    it('Deployer should be the default admin role', async () => {
      const DEFAULT_ADMIN_ROLE = await f.spaceFactory.DEFAULT_ADMIN_ROLE()
      const hasRole = f.spaceFactory.hasRole
      expect(await hasRole(DEFAULT_ADMIN_ROLE, f.deployer.address)).to.equal(true)
      expect(await hasRole(APP_ROLE, f.deployer.address)).to.equal(true)
      expect(await hasRole(CONFIG_ROLE, f.deployer.address)).to.equal(true)

      expect(await hasRole(DEFAULT_ADMIN_ROLE, f.user1.address)).to.equal(false)
      expect(await hasRole(APP_ROLE, f.user1.address)).to.equal(false)
      expect(await hasRole(CONFIG_ROLE, f.user1.address)).to.equal(false)
    })

    it('grantRole and revokeRole', async () => {
      const hasRole = f.spaceFactory.hasRole

      expect(await hasRole(APP_ROLE, f.user1.address)).to.equal(false)

      await expect(f.spaceFactory.connect(f.user0).grantRole(APP_ROLE, f.user1.address)).to.revertedWithCustomError(
        f.spaceFactory,
        'AccessControlUnauthorizedAccount',
      )

      const tx0 = await f.spaceFactory.connect(f.deployer).grantRole(APP_ROLE, f.user1.address)
      await tx0.wait()

      expect(await hasRole(APP_ROLE, f.user1.address)).to.equal(true)

      await expect(f.spaceFactory.connect(f.user0).revokeRole(APP_ROLE, f.user1.address)).to.revertedWithCustomError(
        f.spaceFactory,
        'AccessControlUnauthorizedAccount',
      )

      const tx1 = await f.spaceFactory.connect(f.deployer).revokeRole(APP_ROLE, f.user1.address)
      await tx1.wait()

      expect(await hasRole(APP_ROLE, f.user1.address)).to.equal(false)
    })
  })

  it('setPrice()', async () => {
    expect(await f.spaceFactory.price()).to.equal(price)

    // permission check
    await expect(f.spaceFactory.connect(f.user0).setPrice(precision.token(1))).to.revertedWithCustomError(
      f.spaceFactory,
      'AccessControlUnauthorizedAccount',
    )

    // set price successfully and check emit event
    await expect(f.spaceFactory.connect(f.user9).setPrice(precision.token(10)))
      .to.emit(f.spaceFactory, 'PriceUpdated')
      .withArgs(precision.token(10))

    expect(await f.spaceFactory.price()).to.equal(precision.token(10))
  })

  it('setFeeReceiver()', async () => {
    expect(await f.spaceFactory.feeReceiver()).to.equal(ZeroAddress)

    // check permission
    await expect(f.spaceFactory.connect(f.user4).setFeeReceiver(f.user8.address)).to.revertedWithCustomError(
      f.spaceFactory,
      'AccessControlUnauthorizedAccount',
    )

    // set fee receiver successfully and check emit event
    await expect(f.spaceFactory.connect(f.user9).setFeeReceiver(f.user8.address))
      .to.emit(f.spaceFactory, 'FeeReceiverUpdated')
      .withArgs(f.user8.address)

    expect(await f.spaceFactory.feeReceiver()).to.equal(f.user8.address)
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
      'AccessControlUnauthorizedAccount',
    )

    const user8Balance0 = await ethers.provider.getBalance(f.user8.address)

    const tx = await f.spaceFactory.connect(f.user9).setFeeReceiver(f.user8.address)
    await tx.wait()

    const tx1 = await f.spaceFactory.connect(f.deployer).withdrawEther()
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

    await expect(f.spaceFactory.connect(f.user4).withdrawTokens([spaceAddr1, spaceAddr2])).to.revertedWithCustomError(
      f.spaceFactory,
      'AccessControlUnauthorizedAccount',
    )

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

  it('isSpace()', async () => {
    const { spaceAddr } = await createSpace(f, f.user0, 'SPACE1')

    expect(await f.spaceFactory.isSpace(spaceAddr)).to.be.true
    expect(await f.spaceFactory.isSpace(f.user0.address)).to.be.false
  })
})
