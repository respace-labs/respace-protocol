import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space, Staking } from 'types'
import { approve, buy, claimStakingRewards, createSpace, distributeStakingRewards, sell, stake } from './utils'

describe('Staking', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it.only('Staking', async () => {
    const spaceName = 'TEST'
    const { spaceAddr, space } = await createSpace(f, f.user0, spaceName)

    const balanceOfSpace0 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace0).to.equal(0)

    /** user1 buy 10eth token and stake */
    const { protocolFee: protocolFee1 } = await buy(space, f.user1, precision.token(10))
    const user1TokenBalance0 = await space.balanceOf(f.user1)
    await stake(space, f.user1, user1TokenBalance0)
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(0)

    // check space's funds
    const balanceOfSpace1 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace1).to.equal(user1TokenBalance0 + protocolFee1)

    /** user2 buy teth token and stake */
    const { protocolFee: protocolFee2 } = await buy(space, f.user2, precision.token(5))
    const user2TokenBalance0 = await space.balanceOf(f.user2)
    await stake(space, f.user2, user2TokenBalance0)
    const user1TokenBalance2 = await space.balanceOf(f.user2)
    expect(user1TokenBalance2).to.equal(0)

    // check space's funds
    const balanceOfSpace2 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace2).to.equal(user1TokenBalance0 + protocolFee1 + user2TokenBalance0 + protocolFee2)

    /**
     *  user3 buy and sell to generate some fees
     */

    const { protocolFee: protocolFee3 } = await buy(space, f.user3, precision.token(100))
    const user3TokenBalance0 = await space.balanceOf(f.user3)

    const { protocolFee: protocolFee4, insuranceFee } = await sell(space, f.user3, user3TokenBalance0)

    // user3 all token sold out
    const user3TokenBalance1 = await space.balanceOf(f.user3)
    expect(user3TokenBalance1).to.equal(0)

    const allProtocolFee = protocolFee1 + protocolFee2 + protocolFee3 + protocolFee4

    // check space's funds
    const balanceOfSpace3 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace3).to.equal(user1TokenBalance0 + user2TokenBalance0 + allProtocolFee + insuranceFee)

    const info0 = await space.getSpaceInfo()

    const user1Rewards = await space.currentUserRewards(f.user1)
    const user2Rewards = await space.currentUserRewards(f.user2)
    const user3Rewards = await space.currentUserRewards(f.user3)

    // TODO: how to check fee records?
    // expect(allProtocolFee - insuranceFee).to.equal(info.stakingFee + info.daoFee + user1Rewards + user2Rewards)

    console.log('=====info.stakingFee:', info0.stakingFee, info0.daoFee)

    // console.log('======info:', info.stakingFee)

    const user1TokenBalance3 = await space.balanceOf(f.user1)
    const user2TokenBalance3 = await space.balanceOf(f.user2)

    // distribute rewards to users
    await distributeStakingRewards(space)

    // claim rewards
    await claimStakingRewards(space, f.user1)
    await claimStakingRewards(space, f.user2)

    const user1TokenBalance4 = await space.balanceOf(f.user1)
    const user2TokenBalance4 = await space.balanceOf(f.user2)

    const user1Rewards2 = user1TokenBalance4 - user1TokenBalance3
    const user2Rewards2 = user2TokenBalance4 - user2TokenBalance3

    console.log('==user1Rewards2:', user1Rewards2, 'user2Rewards2:', user2Rewards2)

    const info1 = await space.getSpaceInfo()

    console.log('======info1.stakingFee:', info1.stakingFee)

    // TODO: bug
    expect(user1Rewards2 + user2Rewards2).to.equal(info0.stakingFee)
  })
})
