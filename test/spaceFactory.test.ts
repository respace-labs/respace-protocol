import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space, Staking } from 'types'
import { createSpace, getSpace } from './utils'

describe('spaceFactory', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('create()', async () => {
    const spaceName = 'TEST'

    const index0 = await f.spaceFactory.spaceIndex()
    expect(index0).to.equal(0n)

    const tx = await f.spaceFactory.connect(f.user1).createSpace(spaceName, 'TEST')
    await tx.wait()

    const index1 = await f.spaceFactory.spaceIndex()
    expect(index1).to.equal(1n)

    const space = await f.spaceFactory.getUserLatestSpace(f.user1.address)

    expect(space.name).to.equal(spaceName)

    // const { spaceAddr } = await createSpace(f, f.user0, spaceName)

    // const space = await getSpace(spaceAddr)
    // const info = await space.getSpaceInfo()

    // expect(info.name).to.equal(spaceName)
  })
})
