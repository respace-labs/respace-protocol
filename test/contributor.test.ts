import { Fixture, deployFixture } from '@utils/deployFixture'
import { expect } from 'chai'
import { Space } from 'types'
import { createSpace, getContributor, getSpaceInfo, SHARES_SUPPLY } from './utils'

describe('Contributor', function () {
  let f: Fixture
  let space: Space
  let spaceAddr: string
  let premint = BigInt(0)

  beforeEach(async () => {
    f = await deployFixture()
    const spaceName = 'Test Space'
    const res = await createSpace(f, f.user0, spaceName)
    space = res.space
    spaceAddr = res.spaceAddr
    premint = res.premint
  })

  it('Deploy', async () => {
    const founder = await getContributor(space, f.user0.address)
    const contributors0 = await space.getContributors()
    expect(contributors0.length).to.equal(1)

    expect(founder.shares).to.equal(SHARES_SUPPLY)
    expect(founder.account).to.equal(f.user0.address)
    expect(founder.checkpoint).to.equal(0)
    expect(founder.rewards).to.equal(0)
  })

  it('addContributor by founder', async () => {
    await expect(space.connect(f.user0).addContributor(f.user0.address)).to.revertedWithCustomError(
      f.share,
      'ContributorExisted',
    )

    {
      const contributors = await space.getContributors()
      expect(contributors.length).to.equal(1)
    }

    await expect(space.connect(f.user0).addContributor(f.user2.address))
      .to.emit(space, 'ContributorAdded')
      .withArgs(f.user2.address)

    const contributors = await space.getContributors()
    expect(contributors.length).to.equal(2)

    /** New contributor */
    const contributor = await getContributor(space, f.user2.address)
    expect(contributor.shares).to.equal(0)
    expect(contributor.rewards).to.equal(0)
    expect(contributor.checkpoint).to.equal(0)
    expect(contributor.account).to.equal(f.user2.address)

    const info = await getSpaceInfo(space)

    expect(info.daoRevenue).to.equal(0)
    expect(info.accumulatedRewardsPerShare).to.equal(0)
  })

  it('addContributor with transferShares', async () => {
    const founder0 = await getContributor(space, f.user0.address)

    const amount = 1000n

    const tx0 = await space.connect(f.user0).transferShares(f.user1.address, amount)
    await tx0.wait()

    const founder1 = await getContributor(space, f.user0.address)
    const user1 = await getContributor(space, f.user1.address)

    const contributors1 = await space.getContributors()

    expect(contributors1.length).to.equal(2)
    expect(user1.shares).to.equal(amount)
    expect(founder1.shares).to.equal(founder0.shares - amount)

    const tx1 = await space.connect(f.user0).addContributor(f.user2.address)
    await tx1.wait()

    const contributors2 = await space.getContributors()
    expect(contributors2.length).to.equal(3)
  })
})
