import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space } from 'types'

describe('Space', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('claimShareRewards()', async () => {
    const amount = 10
    const spaceIndex0 = await f.spaceFactory.spaceIndex()
    const spaceName = 'Test Space'

    await f.spaceFactory.connect(f.user0).createSpace(spaceName, 'TEST')

    const spaceAddr = await f.spaceFactory.spaces(spaceIndex0)
    const space = await getSpace(spaceAddr)
    const info = await space.getSpaceInfo()

    console.log('=======info:', info)

    expect(info.name).to.equal(spaceName)

    const spaceEthBalance0 = await ethers.provider.getBalance(spaceAddr)
    console.log('=======spaceEthBalance0:', spaceEthBalance0)

    const spaceEthBalance1 = await ethers.provider.getBalance(spaceAddr)

    console.log('=====:spaceEthBalance1', spaceEthBalance1, precision.toDecimal(spaceEthBalance1))

    const user0EthBalance1 = await ethers.provider.getBalance(f.user0.address)

    const daoFeePercent = await space.daoFeePercent()

    const user0Rewards1 = await space.currentContributorRewards(f.user0.address)

    expect(user0Rewards1).to.equal((spaceEthBalance1 * daoFeePercent) / precision.token(1))

    console.log('======rewards:', user0Rewards1, precision.toDecimal(user0Rewards1))

    // claim share rewards
    await (await space.connect(f.user0).claimShareRewards()).wait()
    const user0Rewards2 = await space.currentContributorRewards(f.user0.address)

    console.log('=======>user0Rewards2:', user0Rewards2)

    const user0EthBalance2 = await ethers.provider.getBalance(f.user0.address)
    const spaceEthBalance2 = await ethers.provider.getBalance(spaceAddr)

    console.log('=====:spaceEthBalance2', spaceEthBalance2, precision.toDecimal(spaceEthBalance2))
    await reconciliation(f, space)
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
