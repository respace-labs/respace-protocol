import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space } from 'types'
import { createSpace, getSpace } from './utils'

describe('Vesting', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('Case1: vesting to an existing contributor', async () => {
    const spaceIndex0 = await f.spaceFactory.spaceIndex()
    const spaceName = 'Test Space'

    await createSpace(f, f.user0, spaceName)

    const spaceAddr = await f.spaceFactory.spaces(spaceIndex0)
    const space = await getSpace(spaceAddr)
    const founder0 = await space.getContributor(f.user0.address)
    const contributors0 = await space.getContributors()

    expect(contributors0.length).to.equal(1)
    expect(founder0.shares).to.equal(10000000)

    const tx1 = await space.connect(f.user0).addContributor(f.user1.address)
    await tx1.wait()

    const contributors2 = await space.getContributors()
    expect(contributors2.length).to.equal(2n)

    const start = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 15 // 15 days ago
    const duration = 60 * 60 * 24 * 30 // 30 days
    const allocation = 10000 // 10k
    const user1 = f.user1

    await space.connect(f.user0).addVesting(user1.address, start, duration, allocation)

    const releasable = await space.vestedAmount(user1.address, Math.floor(Date.now() / 1000))

    expect(releasable).to.equal(allocation / 2)

    await space.connect(user1).releaseVesting()

    const user1Contributor = await space.getContributor(user1.address)

    expect(user1Contributor.shares).to.equal(releasable)
  })

  it('Case2: vesting to an non-existing contributor', async () => {
    const spaceIndex0 = await f.spaceFactory.spaceIndex()
    const spaceName = 'Test Space'

    await createSpace(f, f.user0, spaceName)

    const spaceAddr = await f.spaceFactory.spaces(spaceIndex0)
    const space = await getSpace(spaceAddr)

    const start = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 15 // 15 days ago
    const duration = 60 * 60 * 24 * 30 // 30 days
    const allocation = 10000 // 10k
    const user1 = f.user1

    await space.connect(f.user0).addVesting(user1.address, start, duration, allocation)

    const contributors = await space.getContributors()
    expect(contributors.length).to.equal(2)

    const releasable = await space.vestedAmount(user1.address, Math.floor(Date.now() / 1000))

    expect(releasable).to.equal(allocation / 2)

    await space.connect(user1).releaseVesting()

    const user1Contributor = await space.getContributor(user1.address)

    expect(user1Contributor.shares).to.equal(releasable)
  })
})
