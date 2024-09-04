import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import {
  buy,
  claimStakingRewards,
  createSpace,
  distributeStakingRewards,
  looseEqual,
  sell,
  stake,
  unstake,
} from './utils'
import { Space } from 'types'

describe('Staking', function () {
  let f: Fixture
  let space: Space
  let spaceAddr: string

  beforeEach(async () => {
    f = await deployFixture()
    const spaceName = 'Test Space'
    const res = await createSpace(f, f.user0, spaceName)
    space = res.space
    spaceAddr = res.spaceAddr
  })

  /**
   * case step:
   * 1. user1 buy 10 eth
   * 2. user1 stake all token
   */
  it('Case1: simple stake', async () => {
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.equal(0)

    // step 1
    const { creatorFee } = await buy(space, f.user1, precision.token(10))

    /** step 2 */

    const user1TokenBalance0 = await space.balanceOf(f.user1)
    await expect(stake(space, f.user2, user1TokenBalance0)).to.revertedWithCustomError(
      space,
      'ERC20InsufficientBalance',
    )
    await stake(space, f.user1, user1TokenBalance0)

    // stakers.length +1
    const stakers = await space.getStakers()
    expect(stakers.length).to.equal(1)

    // check staked amount
    const info = await space.getSpaceInfo()
    expect(stakers[0].staked).to.equal(user1TokenBalance0)
    expect(info.totalStaked).to.equal(stakers[0].staked)
    expect(info.totalStaked).to.equal(user1TokenBalance0)

    // check staked amount with funds
    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.equal(info.totalStaked + creatorFee)

    // user1 all tokens is staked
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(0)
  })

  /**
   * case step:
   * 1. user1 buy 10 eth
   * 2. user1 stake 1/4 tokens
   * 3. user1 stake 1/4 tokens
   */
  it('Case2: stake', async () => {
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.equal(0)

    // step 1
    const { creatorFee } = await buy(space, f.user1, precision.token(10))

    const user1TokenBalance0 = await space.balanceOf(f.user1)

    // step 2
    await stake(space, f.user1, user1TokenBalance0 / 4n)

    // step 3
    await stake(space, f.user1, user1TokenBalance0 / 4n)

    // stakers.length +1
    const stakers = await space.getStakers()
    expect(stakers.length).to.equal(1)

    // check staked amount
    const info = await space.getSpaceInfo()
    expect(stakers[0].staked).to.equal(user1TokenBalance0 / 2n)
    expect(info.totalStaked).to.equal(user1TokenBalance0 / 2n)
    expect(info.totalStaked).to.equal(stakers[0].staked)

    // check staked amount with funds
    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.equal(info.totalStaked + creatorFee)

    // user1 all tokens is staked
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(user1TokenBalance0 / 2n)
  })

  /**
   * case step:
   * 1. user1 buy 10 eth
   * 2. user1 stake all token
   * 3. user1 unstake all tokens
   */
  it('Case3: unstake all', async () => {
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.equal(0)

    // step 1
    const { creatorFee } = await buy(space, f.user1, precision.token(10))

    const user1TokenBalance0 = await space.balanceOf(f.user1)

    const info0 = await space.getSpaceInfo()
    expect(info0.stakingFee).to.equal(0n)
    expect(info0.totalStaked).to.equal(0n)
    expect(info0.accumulatedRewardsPerToken).to.equal(0n)

    /** step 2 */
    await stake(space, f.user1, user1TokenBalance0)

    /** step 3 */
    await expect(unstake(space, f.user1, 0n)).to.revertedWith('Amount must be greater than zero')
    await expect(unstake(space, f.user2, user1TokenBalance0)).to.revertedWith('Amount too large')

    await unstake(space, f.user1, user1TokenBalance0)

    const stakers = await space.getStakers()
    expect(stakers.length).to.equal(0)

    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(user1TokenBalance0)

    const info1 = await space.getSpaceInfo()
    expect(info1.stakingFee).to.equal(0n)
    expect(info1.totalStaked).to.equal(0n)
    expect(info1.accumulatedRewardsPerToken).to.equal(0n)
  })

  /**
   * case step:
   * 1. user1 buy 10 eth token
   * 2. user1 stake all tokens
   * 3. user1 buy 10 eth token again
   * 4. user1 claim
   */
  it('Case4: simple claim', async () => {
    const spaceBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceBalance0).to.equal(0)

    // step 1
    const { creatorFee: creatorFee1 } = await buy(space, f.user1, precision.token(10))
    const user1TokenBalance0 = await space.balanceOf(f.user1)

    // step 2
    await stake(space, f.user1, user1TokenBalance0)

    const stakers = await space.getStakers()

    expect(stakers.length).to.equal(1)

    const info0 = await space.getSpaceInfo()

    // all user1's token staked
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(0)

    // step 3
    const { creatorFee: creatorFee2 } = await buy(space, f.user1, precision.token(10))

    const info1 = await space.getSpaceInfo()
    const user1Rewards1 = await space.currentUserRewards(f.user1.address)

    looseEqual(info1.stakingFee, user1Rewards1)
    looseEqual(info1.stakingFee, (creatorFee2 * 2n) / 10n) // 20%

    const user1TokenBalance2 = await space.balanceOf(f.user1)

    const rewardsPerToken1 = await space.currentRewardsPerToken()

    // step 4
    await claimStakingRewards(space, f.user1)

    const rewardsPerToken2 = await space.currentRewardsPerToken()
    const info2 = await space.getSpaceInfo()

    expect(info2.stakingFee).to.equal(0)
    expect(info2.accumulatedRewardsPerToken).to.equal(rewardsPerToken1)
    expect(rewardsPerToken1).to.equal(rewardsPerToken2)

    const user1TokenBalance3 = await space.balanceOf(f.user1)

    expect(user1Rewards1).to.equal(user1TokenBalance3 - user1TokenBalance2)

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

    const { creatorFee: creatorFee4 } = await sell(space, f.user3, user3TokenBalance0)

    // user3 all token sold out
    const user3TokenBalance1 = await space.balanceOf(f.user3)
    expect(user3TokenBalance1).to.equal(0)

    const allProtocolFee = creatorFee1 + creatorFee2 + creatorFee3 + creatorFee4

    // check space's funds
    const balanceOfSpace3 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace3).to.equal(user1TokenBalance0 + user2TokenBalance0 + allProtocolFee)

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

  afterEach(async () => {
    const info = await space.getSpaceInfo()
    const stakers = await space.getStakers()
    const sumStaked = stakers.reduce((acc, staker) => acc + staker.staked, 0n)
    expect(info.totalStaked).to.equal(sumStaked)
  })
})
