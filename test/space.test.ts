import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space } from 'types'
import { createSpace, reconciliation } from './utils'

describe('Space', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('claimShareRewards()', async () => {
    const spaceName = 'Test Space'
    const { spaceAddr, space, info } = await createSpace(f, f.user0, spaceName)

    expect(info.name).to.equal(spaceName)

    const spaceEthBalance0 = await ethers.provider.getBalance(spaceAddr)

    const spaceEthBalance1 = await ethers.provider.getBalance(spaceAddr)

    const user0EthBalance1 = await ethers.provider.getBalance(f.user0.address)

    const stakingFeePercent = await space.stakingFeePercent()

    const user0Rewards1 = await space.currentContributorRewards(f.user0.address)

    expect(user0Rewards1).to.equal((spaceEthBalance1 * (precision.token(1) - stakingFeePercent)) / precision.token(1))

    // claim share rewards
    await (await space.connect(f.user0).claimShareRewards()).wait()
    const user0Rewards2 = await space.currentContributorRewards(f.user0.address)

    const user0EthBalance2 = await ethers.provider.getBalance(f.user0.address)
    const spaceEthBalance2 = await ethers.provider.getBalance(spaceAddr)

    await reconciliation(f, space)
  })
})
