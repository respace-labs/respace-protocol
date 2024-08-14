import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { buy } from '@utils/indieX'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space } from 'types'

describe('Space', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it.only('claimShareRewards()', async () => {
    const amount = 10
    const spaceIndex0 = await f.spaceFactory.spaceIndex()
    const spaceName = 'Test Space'

    await f.spaceFactory.connect(f.user0).createSpace(spaceName, 'TEST', {
      uri: spaceName,
      appId: 0n,
      curatorFeePercent: precision.token(30, 16),
      curve: {
        basePrice: precision.token(0.1),
        inflectionPoint: 100,
        inflectionPrice: precision.token(1),
        linearPriceSlope: 0,
      },
      farmer: 0n,
      isFarming: false,
    })

    const spaceAddr = await f.spaceFactory.spaces(spaceIndex0)
    const space = await getSpace(spaceAddr)
    const info = await space.getInfo()
    const creation = await f.indieX.getCreation(info.creationId)

    expect(info.name).to.equal(spaceName)

    const spaceEthBalance0 = await ethers.provider.getBalance(spaceAddr)
    console.log('=======spaceEthBalance0:', spaceEthBalance0)

    await buy(f, {
      creation,
      amount,
      account: f.user1,
    })

    await buy(f, {
      creation,
      amount,
      account: f.user2,
    })

    await buy(f, {
      creation,
      amount,
      account: f.user3,
    })

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
  const info = await space.getInfo()
  // TODO: not right
  expect(ethBalance).to.equal(info.daoFees + info.stakingFees)
}
