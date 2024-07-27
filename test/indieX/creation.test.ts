import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'

describe('IndieX', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  async function newApp() {
    const tx = await f.indieX.connect(f.user9).newApp({
      name: 'Test App',
      uri: '',
      feeTo: f.deployer,
      appFeePercent: precision.token(2, 16),
      creatorFeePercent: precision.token(5, 16),
    })
    await tx.wait()
  }

  it('New App', async () => {
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

  it('New Creation', async () => {
    await newApp()

    expect(await f.indieX.creationIndex()).to.equal(0n)

    const tx1 = await f.indieX.connect(f.user0).newCreation({
      name: 'Test Creation',
      uri: '',
      appId: 1n,
      farmer: 0n,
      isFarming: false,
      curve: 0n,
      curveArgs: [],
    })

    await tx1.wait()

    expect(await f.indieX.creationIndex()).to.equal(1n)

    const creation = await f.indieX.getUserLatestCreation(f.user0.address)

    expect(creation.creator).to.equal(f.user0)
    expect(creation.name).to.equal('Test Creation')
    expect(creation.appId).to.equal(1n)
    expect(creation.curve).to.equal(0n)
    expect(creation.farmer).to.equal(0n)
    expect(creation.isFarming).to.equal(false)

    const userCreations = await f.indieX.getUserCreations(f.user0.address)
    expect(userCreations.length).to.equal(1)

    const creationById = await f.indieX.getCreation(creation.id)

    expect(creationById.id).to.equal(creation.id)
    expect(creationById.creator).to.equal(creation.creator)

    expect(creationById.id).to.equal(creation.id)
    expect(creationById.appId).to.equal(creation.appId)
    expect(creationById.creator).to.equal(creation.creator)
    expect(creationById.curve).to.equal(creation.curve)
  })

  it('Update Creation', async () => {
    const tx1 = await f.indieX.connect(f.user0).newCreation({
      name: 'Test Creation',
      uri: '',
      appId: 0n,
      farmer: 0n,
      isFarming: false,
      curve: 0n,
      curveArgs: [],
    })

    await tx1.wait()

    const creation0 = await f.indieX.getUserLatestCreation(f.user0.address)

    expect(
      f.indieX.connect(f.user1).updateCreation(creation0.id, {
        name: 'Updated Test Creation',
        uri: 'Updated URI',
      }),
    ).to.revertedWith('Only creator can update Creation')

    await f.indieX.connect(f.user0).updateCreation(creation0.id, {
      name: 'Updated Test Creation',
      uri: 'Updated URI',
    })

    const creation1 = await f.indieX.getUserLatestCreation(f.user0.address)

    expect(creation1.name).to.equal('Updated Test Creation')
    expect(creation1.uri).to.equal('Updated URI')
  })
})
