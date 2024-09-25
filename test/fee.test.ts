import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { buy, createSpace, getSpaceInfo, SpaceInfo, stake } from './utils'
import { Space } from 'types'

let stakingRevenuePercent = 30n
const PER_TOKEN_PRECISION = precision.token(1, 26)

describe('Fee rewards', function () {
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

  async function getStakingRevenuePercent() {
    const info = await getSpaceInfo(space)
    return info.totalStaked > 0 ? stakingRevenuePercent : 0n
  }

  it('fee rewards with staking', async () => {
    const amount1 = precision.token(10)
    const { space, spaceAddr, info } = await createSpace(f, f.user0, 'SPACE')
    expect(info.daoRevenue).to.equal(0n)
    expect(info.stakingRevenue).to.equal(0n)

    const spaceTokenBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceTokenBalance0).to.equal(premint)

    // ==============user1 buy 10 eth =================
    const buyInfo1 = await buy(space, f.user1, amount1)

    const spaceTokenBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceTokenBalance1).to.equal(buyInfo1.creatorFee + premint)

    const info1 = await getSpaceInfo(space)
    stakingRevenuePercent = await getStakingRevenuePercent()

    const stakingRevenue1 = (buyInfo1.creatorFee * stakingRevenuePercent) / 100n
    const daoRevenue1 = buyInfo1.creatorFee - stakingRevenue1

    expect(info1.daoRevenue).to.equal(daoRevenue1)
    expect(info1.stakingRevenue).to.equal(stakingRevenue1)

    // ==============user2 buy 20eth=================

    const amount2 = precision.token(20)
    const buyInfo2 = await buy(space, f.user2, amount2)

    const spaceTokenBalance2 = await space.balanceOf(spaceAddr)
    expect(spaceTokenBalance2).to.equal(buyInfo1.creatorFee + buyInfo2.creatorFee + premint)

    const info2 = await getSpaceInfo(space)
    const stakingRevenue2 = (buyInfo2.creatorFee * stakingRevenuePercent) / 100n
    const daoRevenue2 = buyInfo2.creatorFee - stakingRevenue2

    expect(info2.daoRevenue).to.equal(daoRevenue1 + daoRevenue2)
    expect(info2.stakingRevenue).to.equal(stakingRevenue1 + stakingRevenue2)

    // ============== before staking=================

    const info3 = await getSpaceInfo(space)
    expect(info3.accumulatedRewardsPerToken).to.equal(0n)
    expect(info3.totalStaked).to.equal(0n)
    expect(info3.stakingRevenue).to.equal(info2.stakingRevenue)

    // console.log('======precision.toDecimal(info2.daoRevenue):', precision.toDecimal(info2.daoRevenue))

    // ============== user1 stake 10000 token=================

    await stake(space, f.user1, precision.token(10000))

    const info4 = await getSpaceInfo(space)

    const accumulatedRewardsPerToken = calculateRewardsPerToken(info3.stakingRevenue, precision.token(10000), 0n)

    // expect(info4.accumulatedRewardsPerToken).to.equal(accumulatedRewardsPerToken)
    expect(info4.totalStaked).to.equal(precision.token(10000))

    // ============== user1 before staking claim =================
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    // console.log('=====user1TokenBalance:', user1TokenBalance1)

    // ============== user1 staking claimed =================
    const tx0 = await space.connect(f.user1).claimStakingRewards()
    await tx0.wait()

    const user1TokenBalance2 = await space.balanceOf(f.user1)
    // expect(user1TokenBalance2 - user1TokenBalance1).to.equal(stakingInfo0.stakingRevenue)

    // ============== founder share claimed =================

    const founderTokenBalance1 = await space.balanceOf(f.user0)
    const tx1 = await space.connect(f.user0).claimShareRewards()
    await tx1.wait()
    const founderTokenBalance2 = await space.balanceOf(f.user0)
  })
})

function calculateRewardsPerToken(stakingRevenue: bigint, totalStaked: bigint, preValue: bigint) {
  return preValue + (PER_TOKEN_PRECISION * stakingRevenue) / totalStaked
}
