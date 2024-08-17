import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space } from 'types'

describe('Share', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('Share', async () => {
    const spaceIndex0 = await f.spaceFactory.spaceIndex()
    const spaceName = 'Test Space'

    await f.spaceFactory.connect(f.user0).createSpace(spaceName, 'TEST')

    const spaceAddr = await f.spaceFactory.spaces(spaceIndex0)
    const space = await getSpace(spaceAddr)
    const founder0 = await space.getContributor(f.user0.address)
    const contributors0 = await space.getContributors()

    expect(contributors0.length).to.equal(1)
    expect(founder0.shares).to.equal(1000000)

    const amount = 1000n
    const tx0 = await space.connect(f.user0).transferShares(f.user1.address, amount)
    await tx0.wait()

    const founder1 = await space.getContributor(f.user0.address)
    const user1 = await space.getContributor(f.user1.address)
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

async function getSpace(addr: string) {
  return ethers.getContractAt('Space', addr) as any as Promise<Space>
}

export async function approve(token: Space, spender: string, value: bigint, account: HardhatEthersSigner) {
  const tx = await token.connect(account).approve(spender, value)
  await tx.wait()
}

async function reconciliation(f: Fixture, space: Space) {
  const ethBalance = await ethers.provider.getBalance(await space.getAddress())
  const info = await space.getSpaceInfo()
  // TODO: not right
  expect(ethBalance).to.equal(info.daoFees + info.stakingFees)
}
