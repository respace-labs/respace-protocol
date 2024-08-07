import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'

describe('App', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('Deploy', async () => {
    const appIndex = await f.indieX.appIndex()
    expect(appIndex).to.equal(3n)

    const app = await f.indieX.apps(0n)
    expect(app.id).to.equal(0n)
    expect(app.name).to.equal('Genesis App')
    expect(app.feeTo).to.equal(f.deployer.address)
    expect(app.appFeePercent).to.equal(0n)
    expect(app.creatorFeePercent).to.equal(precision.token(5, 16))
  })

  it('New App fail with empty name', async () => {
    await expect(
      f.indieX.newApp({
        name: '',
        uri: '',
        feeTo: f.deployer,
        appFeePercent: precision.token(2, 16),
        creatorFeePercent: precision.token(5, 16),
      }),
    ).to.revertedWith('Name cannot be empty')
  })

  it('New App fail with invalid feeTo', async () => {
    await expect(
      f.indieX.newApp({
        name: 'Test App',
        uri: '',
        feeTo: ZeroAddress,
        appFeePercent: precision.token(2, 16),
        creatorFeePercent: precision.token(5, 16),
      }),
    ).to.revertedWith('Invalid feeTo address')
  })

  it('New App fail with invalid appFeePercent', async () => {
    await expect(
      f.indieX.newApp({
        name: 'Test App',
        uri: '',
        feeTo: f.deployer,
        appFeePercent: precision.token(11, 16),
        creatorFeePercent: precision.token(5, 16),
      }),
    ).to.revertedWith('appFeePercent must be <= 10%')
  })

  it('New App successfully', async () => {
    await expect(
      f.indieX.newApp({
        name: 'Test App',
        uri: '',
        feeTo: f.deployer,
        appFeePercent: precision.token(2, 16),
        creatorFeePercent: precision.token(5, 16),
      }),
    )
      .to.emit(f.indieX, 'NewApp')
      .withArgs(3n, f.deployer, 'Test App', '', f.deployer, precision.token(2, 16), precision.token(5, 16))

    const appIndex = await f.indieX.appIndex()
    expect(appIndex).to.equal(4n)

    const app = await f.indieX.apps(appIndex - 1n)
    expect(app.id).to.equal(appIndex - 1n)
    expect(app.name).to.equal('Test App')
    expect(app.feeTo).to.equal(f.deployer.address)
    expect(app.appFeePercent).to.equal(precision.token(2, 16))
    expect(app.creatorFeePercent).to.equal(precision.token(5, 16))
  })

  it('Update App fail with not existed', async () => {
    await expect(
      f.indieX.updateApp(3n, {
        name: '',
        uri: '',
        feeTo: f.deployer,
        appFeePercent: precision.token(2, 16),
        creatorFeePercent: precision.token(5, 16),
      }),
    ).to.revertedWith('App not existed')
  })

  it('Update App fail with empty name', async () => {
    await expect(
      f.indieX.updateApp(2n, {
        name: '',
        uri: '',
        feeTo: f.deployer,
        appFeePercent: precision.token(2, 16),
        creatorFeePercent: precision.token(5, 16),
      }),
    ).to.revertedWith('Name cannot be empty')
  })

  it('Update App fail with invalid feeTo', async () => {
    await expect(
      f.indieX.updateApp(2n, {
        name: 'Test App',
        uri: '',
        feeTo: ZeroAddress,
        appFeePercent: precision.token(2, 16),
        creatorFeePercent: precision.token(5, 16),
      }),
    ).to.revertedWith('Invalid feeTo address')
  })

  it('New App fail with invalid appFeePercent', async () => {
    await expect(
      f.indieX.updateApp(2n, {
        name: 'Test App',
        uri: '',
        feeTo: f.deployer,
        appFeePercent: precision.token(11, 16),
        creatorFeePercent: precision.token(5, 16),
      }),
    ).to.revertedWith('appFeePercent must be <= 10%')
  })

  it('Only owner can update App', async () => {
    await expect(
      f.indieX.connect(f.user0).updateApp(2n, {
        name: 'Test App',
        uri: '',
        feeTo: f.deployer,
        appFeePercent: precision.token(2, 16),
        creatorFeePercent: precision.token(5, 16),
      }),
    ).to.revertedWith('Only creator can update App')
  })

  it('Update App successfully', async () => {
    await f.indieX.connect(f.deployer).newApp({
      name: 'Test App',
      uri: '',
      feeTo: f.deployer,
      appFeePercent: precision.token(2, 16),
      creatorFeePercent: precision.token(5, 16),
    })

    const appIndex = await f.indieX.appIndex()

    await f.indieX.updateApp(appIndex - 1n, {
      name: 'Updated Test App',
      uri: 'Updated URI',
      feeTo: f.user0.address,
      appFeePercent: precision.token(3, 16),
      creatorFeePercent: precision.token(6, 16),
    })

    const app = await f.indieX.getApp(appIndex - 1n)

    expect(app.name).to.equal('Updated Test App')
    expect(app.uri).to.equal('Updated URI')
    expect(app.feeTo).to.equal(f.user0.address)
    expect(app.appFeePercent).to.equal(precision.token(3, 16))
    expect(app.creatorFeePercent).to.equal(precision.token(6, 16))
  })
})
