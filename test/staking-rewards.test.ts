import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import {
  buy,
  claimStakingRewards,
  createSpace,
  getReleasedYieldAmount,
  getSpaceInfo,
  looseEqual,
  sell,
  SpaceInfo,
  stake,
} from './utils'
import { Space } from 'types'
import { time } from '@nomicfoundation/hardhat-network-helpers'

describe('Staking rewards', function () {
  let f: Fixture
  let space: Space
  let spaceAddr: string
  let premint = BigInt(0)
  let info: SpaceInfo

  beforeEach(async () => {
    f = await deployFixture()
    const spaceName = 'Test Space'
    const res = await createSpace(f, f.user0, spaceName)
    space = res.space
    spaceAddr = res.spaceAddr
    premint = res.premint
    info = res.info
  })

  /**
   * case step:
   * 1. user1 buy 10 eth
   * 2. user1 stake all tokens
   * 3. user1 claim staking rewards
   */
  it('Case1: one user, simple staking', async () => {
    const balanceOfSpace0 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace0).to.equal(premint)

    // step 1
    const { creatorFee: creatorFee1 } = await buy(space, f.user1, precision.token(10))
    const user1TokenBalance0 = await space.balanceOf(f.user1)

    // step 2
    await stake(space, f.user1, user1TokenBalance0)

    const info1 = await getSpaceInfo(space)

    // all user1's token staked
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(0)

    const user1Rewards1 = await space.currentUserRewards(f.user1.address)

    looseEqual(info1.stakingFee, user1Rewards1)

    const info2 = await getSpaceInfo(space)

    // check space's funds
    const balanceOfSpace = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace).to.equal(user1TokenBalance0 + creatorFee1 + premint)

    // before claiming rewards
    const user1Rewards2 = await space.currentUserRewards(f.user1.address)
    const user1TokenBalance2 = await space.balanceOf(f.user1)

    const time0 = await time.latest()

    // step 3
    await claimStakingRewards(space, f.user1)

    const time1 = await time.latest()
    console.log('=======time1 - time0:', time1 - time0)

    const releasedYieldAmount2 = getReleasedYieldAmount(info1.yieldAmount, time1 - time0)

    console.log('======releasedYieldAmount2:', releasedYieldAmount2)

    const user1TokenBalance3 = await space.balanceOf(f.user1)

    looseEqual(user1Rewards2 + releasedYieldAmount2, user1TokenBalance3 - user1TokenBalance2)

    // all staking rewards claimed to user1
    looseEqual(info1.stakingFee + releasedYieldAmount2, user1TokenBalance3 - user1TokenBalance2)
  })

  /**
   * case step:
   * 1. user1 buy 10 eth token and stake
   * 2. user2 buy 5 eth token and stake
   * 3. user3 buy 100 eth token
   * 4. user3 sell all tokens
   * 5. user1 claim staking rewards
   * 6. user2 claim staking rewards
   */
  it('Case2: multi user buy and sell, multi user staking', async () => {
    const balanceOfSpace0 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace0).to.equal(premint)

    /** step 1 */
    const { creatorFee: creatorFee1 } = await buy(space, f.user1, precision.token(10))
    const user1TokenBalance0 = await space.balanceOf(f.user1)
    await stake(space, f.user1, user1TokenBalance0)
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    expect(user1TokenBalance1).to.equal(0)

    // check space's funds
    const balanceOfSpace1 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace1).to.equal(user1TokenBalance0 + creatorFee1 + premint)

    // step 2
    const { creatorFee: creatorFee2 } = await buy(space, f.user2, precision.token(5))
    const user2TokenBalance0 = await space.balanceOf(f.user2)
    await stake(space, f.user2, user2TokenBalance0)
    const user1TokenBalance2 = await space.balanceOf(f.user2)
    expect(user1TokenBalance2).to.equal(0)

    // check space's funds
    const balanceOfSpace2 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace2).to.equal(user1TokenBalance0 + creatorFee1 + user2TokenBalance0 + creatorFee2 + premint)

    /** step3: user3 buy and sell to generate some fees */
    const { creatorFee: creatorFee3 } = await buy(space, f.user3, precision.token(100))
    const user3TokenBalance0 = await space.balanceOf(f.user3)

    // step 4: user3 all token sold out
    const { creatorFee: creatorFee4 } = await sell(space, f.user3, user3TokenBalance0)

    const user3TokenBalance1 = await space.balanceOf(f.user3)
    expect(user3TokenBalance1).to.equal(0)

    const allProtocolFee = creatorFee1 + creatorFee2 + creatorFee3 + creatorFee4

    // check space's funds
    const balanceOfSpace3 = await space.balanceOf(spaceAddr)
    expect(balanceOfSpace3).to.equal(user1TokenBalance0 + user2TokenBalance0 + allProtocolFee + premint)

    const info0 = await getSpaceInfo(space)

    const user1TokenBalance3 = await space.balanceOf(f.user1)
    const user2TokenBalance3 = await space.balanceOf(f.user2)

    // step 5: claim rewards
    await claimStakingRewards(space, f.user1)

    // step 6: claim rewards
    await claimStakingRewards(space, f.user2)

    const user1TokenBalance4 = await space.balanceOf(f.user1)
    const user2TokenBalance4 = await space.balanceOf(f.user2)

    const user1RewardsToWallet = user1TokenBalance4 - user1TokenBalance3
    const user2RewardsToWallet = user2TokenBalance4 - user2TokenBalance3

    const info1 = await getSpaceInfo(space)

    expect(info1.stakingFee).to.equal(0)

    // all staking rewards claimed to user1 and user2
    // TODO: decimal problem
    // const gap = user1RewardsToWallet + user2RewardsToWallet - (info1.totalFee - info0.daoFee + info1.yieldReleased)
    // expect(Math.abs(Number(gap))).to.be.lessThan(Number(precision.token(2)))
  })
})
