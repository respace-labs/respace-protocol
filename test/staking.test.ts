import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { buy, claimStakingRewards, createSpace, distributeStakingRewards, looseEqual, sell, stake } from './utils'

describe('Staking', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('Case1: one user, simple staking', async () => {
    const spaceName = 'TEST'
    const { spaceAddr, space } = await createSpace(f, f.user0, spaceName)

    const balanceOfSpace0 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace0).to.equal(0)

    /** user1 buy 10eth token and stake */
    const { creatorFee: creatorFee1 } = await buy(space, f.user1, precision.token(10))
    const user1TokenBalance0 = await space.balanceOf(f.user1)

    await stake(space, f.user1, user1TokenBalance0)

    const info1 = await space.getSpaceInfo()

    expect(info1.totalFee).to.equal(info1.daoFee + info1.stakingFee)

    // all user1's token staked
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(0)

    await distributeStakingRewards(space)

    const user1Rewards1 = await space.currentUserRewards(f.user1.address)

    looseEqual(info1.stakingFee, user1Rewards1)

    const info2 = await space.getSpaceInfo()

    expect(info2.stakingFee).to.equal(0)

    // check space's funds
    const balanceOfSpace = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace).to.equal(user1TokenBalance0 + creatorFee1)

    const user1Rewards2 = await space.currentUserRewards(f.user1.address)
    const user1TokenBalance2 = await space.balanceOf(f.user1)

    await claimStakingRewards(space, f.user1)

    const user1TokenBalance3 = await space.balanceOf(f.user1)

    expect(user1Rewards2).to.equal(user1TokenBalance3 - user1TokenBalance2)

    // all staking rewards claimed to user1
    looseEqual(info1.stakingFee, user1TokenBalance3 - user1TokenBalance2)
  })

  it('Case2: multi user buy and sell, multi user staking', async () => {
    const spaceName = 'TEST'
    const { spaceAddr, space } = await createSpace(f, f.user0, spaceName)

    const balanceOfSpace0 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace0).to.equal(0)

    /** user1 buy 10eth token and stake */
    const { creatorFee: creatorFee1 } = await buy(space, f.user1, precision.token(10))
    const user1TokenBalance0 = await space.balanceOf(f.user1)
    await stake(space, f.user1, user1TokenBalance0)
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(0)

    // check space's funds
    const balanceOfSpace1 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace1).to.equal(user1TokenBalance0 + creatorFee1)

    /** user2 buy teth token and stake */
    const { creatorFee: creatorFee2 } = await buy(space, f.user2, precision.token(5))
    const user2TokenBalance0 = await space.balanceOf(f.user2)
    await stake(space, f.user2, user2TokenBalance0)
    const user1TokenBalance2 = await space.balanceOf(f.user2)
    expect(user1TokenBalance2).to.equal(0)

    // check space's funds
    const balanceOfSpace2 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace2).to.equal(user1TokenBalance0 + creatorFee1 + user2TokenBalance0 + creatorFee2)

    /**
     *  user3 buy and sell to generate some fees
     */

    const { creatorFee: creatorFee3 } = await buy(space, f.user3, precision.token(100))
    const user3TokenBalance0 = await space.balanceOf(f.user3)

    const { creatorFee: creatorFee4, insuranceFee } = await sell(space, f.user3, user3TokenBalance0)

    // user3 all token sold out
    const user3TokenBalance1 = await space.balanceOf(f.user3)
    expect(user3TokenBalance1).to.equal(0)

    const allProtocolFee = creatorFee1 + creatorFee2 + creatorFee3 + creatorFee4

    // check space's funds
    const balanceOfSpace3 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace3).to.equal(user1TokenBalance0 + user2TokenBalance0 + allProtocolFee + insuranceFee)

    const info0 = await space.getSpaceInfo()

    const user1TokenBalance3 = await space.balanceOf(f.user1)
    const user2TokenBalance3 = await space.balanceOf(f.user2)

    // distribute rewards to users
    await distributeStakingRewards(space)

    // claim rewards
    await claimStakingRewards(space, f.user1)
    await claimStakingRewards(space, f.user2)

    const user1TokenBalance4 = await space.balanceOf(f.user1)
    const user2TokenBalance4 = await space.balanceOf(f.user2)

    const user1RewardsToWallet = user1TokenBalance4 - user1TokenBalance3
    const user2RewardsToWallet = user2TokenBalance4 - user2TokenBalance3

    const info1 = await space.getSpaceInfo()

    expect(info1.stakingFee).to.equal(0)

    // all staking rewards claimed to user1 and user2
    looseEqual(user1RewardsToWallet + user2RewardsToWallet, info1.totalFee - info0.daoFee)
  })
})
