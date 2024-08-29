import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'

describe('spaceFactory', function () {
  let f: Fixture

  const price = precision.token('0.01024')

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('setPrice()', async () => {
    expect(await f.spaceFactory.price()).to.equal(price)

    await expect(f.spaceFactory.connect(f.user0).setPrice(precision.token(1))).to.revertedWithCustomError(
      f.spaceFactory,
      'OwnableUnauthorizedAccount',
    )

    const tx = await f.spaceFactory.connect(f.deployer).setPrice(precision.token(1))
    await tx.wait()

    expect(await f.spaceFactory.price()).to.equal(precision.token(1))
  })

  it('create()', async () => {
    const spaceName = 'TEST'

    const index0 = await f.spaceFactory.spaceIndex()
    expect(index0).to.equal(0n)

    // Insufficient payment
    await expect(f.spaceFactory.connect(f.user1).createSpace(spaceName, 'TEST', { value: 0 })).to.revertedWith(
      'Insufficient payment',
    )

    const tx0 = await f.spaceFactory.connect(f.user1).createSpace(spaceName, 'TEST', { value: price })
    await tx0.wait()

    const index1 = await f.spaceFactory.spaceIndex()
    expect(index1).to.equal(1n)

    const space = await f.spaceFactory.getUserLatestSpace(f.user1.address)
    expect(space.name).to.equal(spaceName)

    const spaces = await f.spaceFactory.getUserSpaces(f.user1.address)
    const userSpace = await f.spaceFactory.spaces(0n)

    expect(spaces.length).to.equal(1)
    expect(spaces[0]).to.equal(userSpace)

    /** create after setPrice */
    const tx1 = await f.spaceFactory.connect(f.deployer).setPrice(precision.token(1))
    await tx1.wait()

    await expect(f.spaceFactory.connect(f.user1).createSpace(spaceName, 'TEST', { value: price })).to.revertedWith(
      'Insufficient payment',
    )

    const tx2 = await f.spaceFactory.connect(f.user1).createSpace(spaceName, 'TEST', { value: precision.token(1) })
    await tx2.wait()
  })
})
