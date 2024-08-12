import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'

describe('Test deploy', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('Test Genesis App', async () => {
    const appIndex = await f.indieX.appIndex()
    expect(appIndex).to.equal(3n)

    const app = await f.indieX.apps(0n)
    expect(app.id).to.equal(0n)
    expect(app.uri).to.equal('Genesis App')
    expect(app.feeTo).to.equal(f.deployer.address)
    expect(app.appFeePercent).to.equal(0n)
    expect(app.creatorFeePercent).to.equal(precision.token(5, 16))
  })
})
