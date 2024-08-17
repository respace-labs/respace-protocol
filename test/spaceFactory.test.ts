import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space, Staking } from 'types'

describe('Space', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('create()', async () => {
    const amount = 1
    const spaceIndex0 = await f.spaceFactory.spaceIndex()
    const spaceName = 'Test Space'

    await f.spaceFactory.connect(f.user0).createSpace(spaceName, 'TEST')

    const spaceIndex1 = await f.spaceFactory.spaceIndex()
    // console.log('======spaceIndex1:', spaceIndex1)
    const spaceAddr = await f.spaceFactory.spaces(spaceIndex0)

    const space = await getSpace(spaceAddr)
    const info = await space.getSpaceInfo()
    // const spaceAddr = info.space

    expect(info.name).to.equal(spaceName)
  })
})

async function getSpace(addr: string) {
  return ethers.getContractAt('Space', addr) as any as Promise<Space>
}

export async function approve(token: Space, spender: string, value: bigint, account: HardhatEthersSigner) {
  const tx = await token.connect(account).approve(spender, value)
  await tx.wait()
}
