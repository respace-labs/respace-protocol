import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { ZeroAddress } from 'ethers'

const { keccak256, toUtf8Bytes } = ethers
const APP_ROLE = keccak256(toUtf8Bytes('APP_ROLE'))
const CONFIG_ROLE = keccak256(toUtf8Bytes('CONFIG_ROLE'))

describe('App', function () {
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

  it('Deploy', async () => {
    const appIndex = await f.spaceFactory.appIndex()
    expect(appIndex).to.equal(1n)
    const app = await f.spaceFactory.apps(appIndex - 1n)

    expect(app.uri).to.equal('Genesis App')
    expect(app.creator).to.equal(f.deployer)
    expect(app.feeReceiver).to.equal(f.spaceFactoryAddr)
    expect(app.feePercent).to.equal(precision.token('0.03'))

    const app1 = await f.spaceFactory.apps(appIndex)
    expect(app1.creator).to.equal(ZeroAddress)
  })

  it('createApp()', async () => {
    await expect(
      f.spaceFactory.connect(f.user0).createApp('MyApp', f.user1.address, precision.token('0.04')),
    ).to.revertedWithCustomError(f.spaceFactory, 'AccessControlUnauthorizedAccount')

    await expect(
      f.spaceFactory.connect(f.user8).createApp('', ZeroAddress, precision.token('0.05')),
    ).to.revertedWithCustomError(f.spaceFactory, 'InvalidFeeReceiver')

    await expect(
      f.spaceFactory.connect(f.user8).createApp('', f.user1.address, precision.token('0.21')),
    ).to.revertedWithCustomError(f.spaceFactory, 'ExceedMaxAppFeePercent')

    await expect(f.spaceFactory.connect(f.user8).createApp('MyApp', f.user1.address, precision.token('0.04')))
      .to.emit(f.spaceFactory, 'AppCreated')
      .withArgs(1n, f.user8.address, 'MyApp', f.user1.address, precision.token('0.04'))

    const app = await f.spaceFactory.apps(1n)

    expect(app.uri).to.equal('MyApp')
    expect(app.creator).to.equal(f.user8)
    expect(app.feeReceiver).to.equal(f.user1)
    expect(app.feePercent).to.equal(precision.token('0.04'))
  })

  it('updateApp()', async () => {
    const tx = await f.spaceFactory.connect(f.user8).createApp('MyApp', f.user1.address, precision.token('0.04'))
    await tx.wait()

    await expect(
      f.spaceFactory.connect(f.user8).updateApp(10n, '', ZeroAddress, precision.token('0.05')),
    ).to.revertedWithCustomError(f.spaceFactory, 'AppNotFound')

    await expect(
      f.spaceFactory.connect(f.deployer).updateApp(1n, '', ZeroAddress, precision.token('0.05')),
    ).to.revertedWithCustomError(f.spaceFactory, 'OnlyCreator')

    await expect(
      f.spaceFactory.connect(f.user8).updateApp(1n, '', ZeroAddress, precision.token('0.05')),
    ).to.revertedWithCustomError(f.spaceFactory, 'InvalidFeeReceiver')

    await expect(
      f.spaceFactory.connect(f.user8).createApp('', f.user1.address, precision.token('0.21')),
    ).to.revertedWithCustomError(f.spaceFactory, 'ExceedMaxAppFeePercent')

    await expect(
      f.spaceFactory.connect(f.user1).updateApp(1n, 'UpdatedApp', f.user9.address, precision.token('0.01')),
    ).to.revertedWithCustomError(f.spaceFactory, 'AccessControlUnauthorizedAccount')

    {
      await expect(
        f.spaceFactory.connect(f.user8).updateApp(1n, 'UpdatedApp', f.user9.address, precision.token('0.01')),
      )
        .to.emit(f.spaceFactory, 'AppUpdated')
        .withArgs(1n, f.user8.address, 'UpdatedApp', f.user9.address, precision.token('0.01'))

      const app2 = await f.spaceFactory.apps(1n)
      expect(app2.uri).to.equal('UpdatedApp')
      expect(app2.creator).to.equal(f.user8)
      expect(app2.feeReceiver).to.equal(f.user9)
      expect(app2.feePercent).to.equal(precision.token('0.01'))
    }
  })
})
