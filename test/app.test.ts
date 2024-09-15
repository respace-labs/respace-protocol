import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { buy, createSpace } from './utils'
import { ethers } from 'hardhat'
import { ZeroAddress } from 'ethers'

describe('App', function () {
  let f: Fixture

  const price = precision.token('0.01024')

  beforeEach(async () => {
    f = await deployFixture()
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
    await expect(f.spaceFactory.createApp('', ZeroAddress, precision.token('0.05'))).to.revertedWith(
      'Invalid feeReceiver address',
    )

    await expect(f.spaceFactory.createApp('', f.user1.address, precision.token('0.051'))).to.revertedWith(
      'appFeePercent must be <= 5%',
    )

    await expect(f.spaceFactory.connect(f.user0).createApp('MyApp', f.user1.address, precision.token('0.04')))
      .to.emit(f.spaceFactory, 'AppCreated')
      .withArgs(1n, f.user0.address, 'MyApp', f.user1.address, precision.token('0.04'))

    const app = await f.spaceFactory.apps(1n)

    expect(app.uri).to.equal('MyApp')
    expect(app.creator).to.equal(f.user0)
    expect(app.feeReceiver).to.equal(f.user1)
    expect(app.feePercent).to.equal(precision.token('0.04'))
  })

  it('updateApp()', async () => {
    const tx = await f.spaceFactory.connect(f.user1).createApp('MyApp', f.user1.address, precision.token('0.04'))
    await tx.wait()

    const app1 = await f.spaceFactory.apps(1n)

    await expect(f.spaceFactory.updateApp(10n, '', ZeroAddress, precision.token('0.05'))).to.revertedWith(
      'App not existed',
    )

    await expect(f.spaceFactory.updateApp(1n, '', ZeroAddress, precision.token('0.05'))).to.revertedWith(
      'Only creator can update App',
    )

    await expect(
      f.spaceFactory.connect(f.user1).updateApp(1n, '', ZeroAddress, precision.token('0.05')),
    ).to.revertedWith('Invalid feeReceiver address')

    await expect(
      f.spaceFactory.connect(f.user1).updateApp(1n, '', f.user2.address, precision.token('0.051')),
    ).to.revertedWith('appFeePercent must be <= 5%')

    await expect(f.spaceFactory.createApp('', f.user1.address, precision.token('0.051'))).to.revertedWith(
      'appFeePercent must be <= 5%',
    )

    {
      await expect(
        f.spaceFactory.connect(f.user1).updateApp(1n, 'UpdatedApp', f.user9.address, precision.token('0.01')),
      )
        .to.emit(f.spaceFactory, 'AppUpdated')
        .withArgs(1n, f.user1.address, 'UpdatedApp', f.user9.address, precision.token('0.01'))

      const app2 = await f.spaceFactory.apps(1n)
      expect(app2.uri).to.equal('UpdatedApp')
      expect(app2.creator).to.equal(f.user1)
      expect(app2.feeReceiver).to.equal(f.user9)
      expect(app2.feePercent).to.equal(precision.token('0.01'))
    }
  })
})
