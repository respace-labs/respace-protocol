import { Fixture, deployFixture } from '@utils/deployFixture'
import { expect } from 'chai'
import { approve, buy, createSpace, getSpaceInfo } from './utils'
import { precision } from '@utils/precision'

describe('Space', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('updateConfig()', async () => {
    const { space } = await createSpace(f, f.user1, 'TEST')

    const config0 = await space.config()
    expect(config0.uri).to.equal('')
    expect((config0.stakingRevenuePercent * 100n) / precision.token(1)).to.equal(30)

    await expect(
      space.connect(f.user0).updateConfig('https://example.com', precision.token(0.5)),
    ).to.revertedWithCustomError(space, 'OwnableUnauthorizedAccount')

    await expect(space.connect(f.user1).updateConfig('https://example.com', precision.token(0.2)))
      .to.emit(space, 'SpaceConfigUpdated')
      .withArgs('https://example.com', precision.token(0.2))

    const config1 = await space.config()
    expect(config1.uri).to.equal('https://example.com')
    expect((config1.stakingRevenuePercent * 100n) / precision.token(1)).to.equal(20)
  })

  it('depositSpaceToken()', async () => {
    const { space } = await createSpace(f, f.user1, 'TEST')

    const { tokenAmountAfterFee, creatorFee } = await buy(space, f.user1, precision.token(0.1))

    const spaceBalance0 = await space.balanceOf(space)

    const user1Balance0 = await space.balanceOf(f.user1)

    await approve(space, f.user0, tokenAmountAfterFee)
    await expect(space.connect(f.user0).depositSpaceToken(tokenAmountAfterFee)).to.revertedWithCustomError(
      space,
      'ERC20InsufficientBalance',
    )

    const info0 = await getSpaceInfo(space)
    expect(info0.daoRevenue).to.equal(creatorFee)

    await approve(space, f.user1, tokenAmountAfterFee)
    await expect(space.connect(f.user1).depositSpaceToken(tokenAmountAfterFee)).to.emit(space, 'TokenDeposited')

    const spaceBalance1 = await space.balanceOf(space)

    expect(spaceBalance1).to.equal(spaceBalance0 + tokenAmountAfterFee)

    const user1Balance1 = await space.balanceOf(f.user1)
    expect(user1Balance1).to.equal(0)

    const info1 = await getSpaceInfo(space)
    expect(info1.daoRevenue).to.equal(tokenAmountAfterFee + info0.daoRevenue)
  })
})
