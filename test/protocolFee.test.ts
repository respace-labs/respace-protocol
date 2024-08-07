import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'

describe('protocolFee', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('setProtocolFeeTo', async () => {
    const feeTo0 = await f.indieX.protocolFeeTo()
    expect(feeTo0).to.equal(f.deployer.address)

    await expect(f.indieX.connect(f.user0).setProtocolFeeTo(f.user0.address)).to.revertedWithCustomError(
      f.indieX,
      'OwnableUnauthorizedAccount',
    )

    const tx = await f.indieX.connect(f.deployer).setProtocolFeeTo(f.user0)
    await tx.wait()

    const feeTo1 = await f.indieX.protocolFeeTo()
    expect(feeTo1).to.equal(f.user0.address)
  })

  it('setProtocolFeePercent', async () => {
    const feePercent0 = await f.indieX.protocolFeePercent()
    expect(feePercent0).to.equal(precision.token(1, 16))

    await expect(f.indieX.connect(f.user0).setProtocolFeePercent(precision.token(1, 15))).to.revertedWithCustomError(
      f.indieX,
      'OwnableUnauthorizedAccount',
    )

    const tx = await f.indieX.connect(f.deployer).setProtocolFeePercent(precision.token(1, 15))
    await tx.wait()

    const feePercent1 = await f.indieX.protocolFeePercent()
    expect(feePercent1).to.equal(precision.token(1, 15))

    // set 11% fail
    await expect(f.indieX.connect(f.deployer).setProtocolFeePercent(precision.token(11, 15))).to.revertedWith(
      'protocolFeePercent must be <= 1%',
    )
  })
})
