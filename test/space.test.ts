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

    console.log('=======info:', info)

    expect(info.name).to.equal(spaceName)

    const spaceEthBalance0 = await ethers.provider.getBalance(spaceAddr)
    console.log('=======spaceEthBalance0:', spaceEthBalance0)

    const spaceEthBalance1 = await ethers.provider.getBalance(spaceAddr)

    console.log('=====:spaceEthBalance1', spaceEthBalance1, precision.decimal(spaceEthBalance1))

    const user0EthBalance1 = await ethers.provider.getBalance(f.user0.address)

    const daoFeePercent = await space.daoFeePercent()

    const user0Rewards1 = await space.currentContributorRewards(f.user0.address)

    expect(user0Rewards1).to.equal((spaceEthBalance1 * daoFeePercent) / precision.token(1))

    console.log('======rewards:', user0Rewards1, precision.decimal(user0Rewards1))

    // claim share rewards
    await (await space.connect(f.user0).claimShareRewards()).wait()
    const user0Rewards2 = await space.currentContributorRewards(f.user0.address)

    console.log('=======>user0Rewards2:', user0Rewards2)

    const user0EthBalance2 = await ethers.provider.getBalance(f.user0.address)
    const spaceEthBalance2 = await ethers.provider.getBalance(spaceAddr)

    console.log('=====:spaceEthBalance2', spaceEthBalance2, precision.decimal(spaceEthBalance2))
    await reconciliation(f, space)
  })
})
