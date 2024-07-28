import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'

describe('addCurve', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('Can addCurve', async () => {
    const curveIndex = await f.indieX.curveIndex()
    expect(curveIndex).to.equal(2n)

    const tx = await f.indieX.connect(f.deployer).addCurve(await f.quadraticCurve.getAddress())
    await tx.wait()

    const curveIndexAfter = await f.indieX.curveIndex()
    expect(curveIndexAfter).to.equal(curveIndex + 1n)
  })

  it('Only owner can addCurve', async () => {
    const curveIndex = await f.indieX.curveIndex()
    expect(curveIndex).to.equal(2n)

    await expect(f.indieX.connect(f.user0).addCurve(await f.quadraticCurve.getAddress())).to.revertedWithCustomError(
      f.indieX,
      'OwnableUnauthorizedAccount',
    )

    const tx = await f.indieX.connect(f.deployer).addCurve(await f.quadraticCurve.getAddress())
    await tx.wait()

    const curveIndexAfter = await f.indieX.curveIndex()
    expect(curveIndexAfter).to.equal(curveIndex + 1n)
  })
})
