import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space } from 'types'
import { createSpace, getContributor, getSpaceInfo, SHARES_SUPPLY } from './utils'

describe('Contributor', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('Deploy', async () => {
    const spaceName = 'Test Space'
    const { spaceAddr, space, info } = await createSpace(f, f.user0, spaceName)

    const founder0 = await getContributor(space, f.user0.address)
    const contributors0 = await space.getContributors()

    expect(contributors0.length).to.equal(1)
    expect(founder0.shares).to.equal(SHARES_SUPPLY)
  })

  it('addContributor by founder', async () => {
    const spaceName = 'Test Space'
    const { spaceAddr, space } = await createSpace(f, f.user1, spaceName)

    await expect(space.connect(f.user1).addContributor(f.user1.address)).to.revertedWithCustomError(
      f.share,
      'ContributorIsExisted',
    )

    const tx1 = await space.connect(f.user1).addContributor(f.user2.address)
    await tx1.wait()

    const contributors = await space.getContributors()
    expect(contributors.length).to.equal(2)

    /** New contributor */
    const contributor = await getContributor(space, f.user2.address)
    expect(contributor.shares).to.equal(0)
    expect(contributor.rewards).to.equal(0)
    expect(contributor.checkpoint).to.equal(0)
    expect(contributor.account).to.equal(f.user2.address)

    const info = await getSpaceInfo(space)

    expect(info.daoFee).to.equal(0)
    expect(info.accumulatedRewardsPerShare).to.equal(0)
  })

  it('addContributor with transferShares', async () => {
    const spaceName = 'Test Space'
    const { spaceAddr, space, info } = await createSpace(f, f.user0, spaceName)

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
