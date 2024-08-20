import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { buy, createSpace, distributeStakingRewards, stake } from './utils'

const daoFeePercent = 50n
const PER_TOKEN_PRECISION = precision.token(1)

describe('Fee rewards', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('fee rewards with staking', async () => {
    const amount1 = precision.token(10)
    const { space, spaceAddr, info } = await createSpace(f, f.user0, 'SPACE')
    expect(info.insuranceEthAmount).to.equal(0n)
    expect(info.daoFee).to.equal(0n)
    expect(info.stakingFee).to.equal(0n)

    const spaceTokenBalance0 = await space.balanceOf(spaceAddr)
    expect(spaceTokenBalance0).to.equal(0)

    // ==============user1 buy 10 eth =================
    const [tokenAmountAfterFee1, , , protocolFee1, insuranceFee1] = await space.getTokenAmount(amount1)
    const tokenAmount1 = tokenAmountAfterFee1 + protocolFee1

    expect(insuranceFee1).to.equal(amount1 / 1000n)
    expect(protocolFee1).to.equal(tokenAmount1 / 100n)

    await buy(space, f.user1, amount1)

    const spaceTokenBalance1 = await space.balanceOf(spaceAddr)
    expect(protocolFee1).to.equal(spaceTokenBalance1)

    const info1 = await space.getSpaceInfo()
    const daoFee1 = (protocolFee1 * daoFeePercent) / 100n
    const stakingFee1 = protocolFee1 - daoFee1

    expect(info1.insuranceEthAmount).to.equal(insuranceFee1)
    expect(info1.daoFee).to.equal(daoFee1)
    expect(info1.stakingFee).to.equal(stakingFee1)

    // ==============user2 buy 20eth=================

    const amount2 = precision.token(20)
    const [tokenAmountAfterFee2, , , protocolFee2, insuranceFee2] = await space.getTokenAmount(amount2)
    const tokenAmount2 = tokenAmountAfterFee2 + protocolFee2

    expect(insuranceFee2).to.equal(amount2 / 1000n)
    expect(protocolFee2).to.equal(tokenAmount2 / 100n)

    await buy(space, f.user2, amount2)

    const spaceTokenBalance2 = await space.balanceOf(spaceAddr)
    expect(spaceTokenBalance2).to.equal(protocolFee1 + protocolFee2)

    const info2 = await space.getSpaceInfo()
    const daoFee2 = (protocolFee2 * daoFeePercent) / 100n
    const stakingFee2 = protocolFee2 - daoFee2

    expect(info2.insuranceEthAmount).to.equal(insuranceFee1 + insuranceFee2)
    expect(info2.daoFee).to.equal(daoFee1 + daoFee2)
    expect(info2.stakingFee).to.equal(stakingFee1 + stakingFee2)

    // ============== before staking=================

    const stakingInfo0 = await space.getStakingInfo()
    expect(stakingInfo0.accumulatedRewardsPerToken).to.equal(0n)
    expect(stakingInfo0.totalStaked).to.equal(0n)
    expect(stakingInfo0.stakingFee).to.equal(info2.stakingFee)

    // console.log('======precision.toDecimal(info2.daoFee):', precision.toDecimal(info2.daoFee))

    // ============== user1 stake 10000 token=================

    await stake(space, f.user1, precision.token(10000))
    await distributeStakingRewards(space)

    const stakingInfo1 = await space.getStakingInfo()

    const accumulatedRewardsPerToken = calculateRewardsPerToken(stakingInfo0.stakingFee, precision.token(10000), 0n)

    expect(stakingInfo1.accumulatedRewardsPerToken).to.equal(accumulatedRewardsPerToken)
    expect(stakingInfo1.totalStaked).to.equal(precision.token(10000))

    // ============== user1 before staking claim =================
    const user1TokenBalance1 = await space.balanceOf(f.user1)
    // console.log('=====user1TokenBalance:', user1TokenBalance1)

    // ============== user1 staking claimed =================
    const tx0 = await space.connect(f.user1).claimStakingRewards()
    await tx0.wait()

    const user1TokenBalance2 = await space.balanceOf(f.user1)
    // expect(user1TokenBalance2 - user1TokenBalance1).to.equal(stakingInfo0.stakingFee)

    // ============== founder share claimed =================

    const founderTokenBalance1 = await space.balanceOf(f.user0)
    const tx1 = await space.connect(f.user0).claimShareRewards()
    await tx1.wait()
    const founderTokenBalance2 = await space.balanceOf(f.user0)
    console.log('=====founderTokenBalance2:', founderTokenBalance2)
  })
})

function calculateRewardsPerToken(stakingFee: bigint, totalStaked: bigint, preValue: bigint) {
  return preValue + (PER_TOKEN_PRECISION * stakingFee) / totalStaked
}
