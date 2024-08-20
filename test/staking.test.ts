import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space, Staking } from 'types'
import { approve, buy, createSpace, distributeStakingRewards, stake } from './utils'

describe('Staking', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('Staking', async () => {
    const spaceName = 'TEST'
    const { spaceAddr, space, info } = await createSpace(f, f.user0, spaceName)

    const spaceEthBalance1 = await ethers.provider.getBalance(spaceAddr)
    // expect(spaceEthBalance1 - spaceEthBalance0).to.equal(creatorFee / 2n)


    await buy(space, f.user1, precision.token(10))
    await stake(space, f.user1, 2000000n)
    await distributeStakingRewards(space)

    const stakingInfo1 = await space.getStakingInfo()

    // expect(stakingInfo1.accumulatedRewardsPerToken).to.equal(0n)
    // expect(stakingInfo1.totalStaked).to.equal(0n)
    // expect(stakingInfo1.stakingFee).to.equal(0n)

    console.log(
      '=====stakingInfo:',
      stakingInfo1,
      stakingInfo1.accumulatedRewardsPerToken,
      precision.decimal(stakingInfo1.accumulatedRewardsPerToken),
    )

    return

    //
    await buy(space, f.user1, precision.token(1))
    const user1TokenBalance = await space.balanceOf(f.user1)

    // console.log('========tokenBalance:', user1TokenBalance, precision.toDecimal(user1TokenBalance))

    await buy(space, f.user2, precision.token(1))
    const user2TokenBalance = await space.balanceOf(f.user2)
    // console.log('=======user2=tokenBalance:', user2TokenBalance, precision.toDecimal(user2TokenBalance))

    await approve(space, spaceAddr, user1TokenBalance / 1n, f.user1)
    await stake(space, f.user1, user1TokenBalance / 1n)

    {
      const dis = await space.distributeStakingRewards()
      await dis.wait()

      const stakingInfo = await space.getStakingInfo()
      console.log(
        '=====stakingInfo:',
        stakingInfo,
        stakingInfo.accumulatedRewardsPerToken,
        precision.decimal(stakingInfo.accumulatedRewardsPerToken),
      )
    }

    await approve(space, spaceAddr, user2TokenBalance / 1n, f.user2)
    await stake(space, f.user2, user2TokenBalance / 1n)

    {
      const dis = await space.distributeStakingRewards()
      await dis.wait()
      const stakingInfo = await space.getStakingInfo()
      console.log(
        '=====stakingInfo:',
        stakingInfo,
        stakingInfo.accumulatedRewardsPerToken,
        precision.decimal(stakingInfo.accumulatedRewardsPerToken),
      )
    }

    {
      await buy(space, f.deployer, precision.token(1))
      await approve(space, spaceAddr, 2000000n, f.deployer)
      await stake(space, f.deployer, 2000000n)
      const dis = await space.distributeShareRewards()
      await dis.wait()
      const stakingInfo = await space.getStakingInfo()
      console.log(
        '=====stakingInfo:',
        stakingInfo,
        stakingInfo.accumulatedRewardsPerToken,
        precision.decimal(stakingInfo.accumulatedRewardsPerToken),
      )
    }

    {
      const tx = await f.deployer.sendTransaction({
        to: spaceAddr,
        value: precision.token(1),
      })
      await tx.wait()
    }

    const deployerRewards = await space.currentUserRewards(f.deployer)
    const user1Rewards = await space.currentUserRewards(f.user1)
    const user2Rewards = await space.currentUserRewards(f.user2)

    console.log('==user1Rewards:', user1Rewards, 'user2Rewards:', user2Rewards)

    console.log(
      'sum......:',
      user1Rewards + user2Rewards + deployerRewards,
      precision.decimal(user1Rewards + user2Rewards + deployerRewards),
    )

    const spaceEthBalance3 = await ethers.provider.getBalance(spaceAddr)
    console.log('===eth spaceEthBalance3:', spaceEthBalance3, precision.decimal(spaceEthBalance3))

    await buy(space, f.user3, precision.token(1))
    const user3TokenBalance = await space.balanceOf(f.user3)

    await buy(space, f.user4, precision.token(1))
    const user4TokenBalance = await space.balanceOf(f.user4)

    const ethTx2 = await f.deployer.sendTransaction({
      to: spaceAddr,
      value: precision.token(1),
    })
    await ethTx2.wait()

    await approve(space, spaceAddr, user3TokenBalance / 1n, f.user3)
    await stake(space, f.user3, user3TokenBalance / 1n)

    await approve(space, spaceAddr, user4TokenBalance / 1n, f.user4)
    await stake(space, f.user4, user4TokenBalance / 1n)

    {
      const tx = await f.deployer.sendTransaction({
        to: spaceAddr,
        value: precision.token(1),
      })
      await tx.wait()
    }

    const stakingInfo = await space.getStakingInfo()
    console.log('eth========spaceEthBalance3:', spaceEthBalance3, precision.decimal(spaceEthBalance3))

    const user3Rewards = await space.currentUserRewards(f.user3)
    const user4Rewards = await space.currentUserRewards(f.user4)

    console.log(
      '=====user1Rewards:',
      user1Rewards,
      precision.decimal(user1Rewards),
      'user2Rewards:',
      user2Rewards,
      precision.decimal(user2Rewards),
      'user3Rewards:',
      user3Rewards,
      precision.decimal(user3Rewards),
      'user4Rewards:',
      user4Rewards,
      precision.decimal(user4Rewards),
    )
  })
})
