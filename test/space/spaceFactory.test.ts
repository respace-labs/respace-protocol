import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space } from 'types'

describe('Space', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('create()', async () => {
    const amount = 1
    const spaceIndex0 = await f.spaceFactory.spaceIndex()
    const spaceName = 'Test Space'

    await f.spaceFactory.connect(f.user0).createSpace(
      spaceName,
      'TEST',
      {
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
      },
      {
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
      },
    )

    const spaceIndex1 = await f.spaceFactory.spaceIndex()
    // console.log('======spaceIndex1:', spaceIndex1)
    const spaceAddr = await f.spaceFactory.spaces(spaceIndex0)

    const space = await getSpace(spaceAddr)
    const info = await space.getInfo()
    // const spaceAddr = info.space
    const creation = await f.indieX.getCreation(info.creationId)

    expect(info.name).to.equal(spaceName)

    // member creation
    {
      const spaceBalance = await f.indieX.balanceOf(spaceAddr, info.creationId)
      const user0Balance = await f.indieX.balanceOf(f.user0.address, info.creationId)

      expect(spaceBalance).to.equal(0n)
      expect(user0Balance).to.equal(1n)
    }

    // sponsor creation
    {
      const spaceBalance = await f.indieX.balanceOf(spaceAddr, info.sponsorCreationId)
      const user0Balance = await f.indieX.balanceOf(f.user0.address, info.sponsorCreationId)

      expect(spaceBalance).to.equal(0n)
      expect(user0Balance).to.equal(1n)
    }

    const spaceEthBalance0 = await ethers.provider.getBalance(spaceAddr)

    const {
      priceAfterFee: buyPriceAfterFee,
      price: buyPrice,
      creatorFee,
      appFee,
      protocolFee,
    } = await f.indieX.getBuyPriceAfterFee(creation.id, amount, creation.appId)

    const tx1 = await f.indieX.connect(f.user1).buy(creation.id, amount, ZeroAddress, { value: buyPriceAfterFee })
    await tx1.wait()

    const spaceEthBalance1 = await ethers.provider.getBalance(spaceAddr)
    // expect(spaceEthBalance1 - spaceEthBalance0).to.equal(creatorFee / 2n)
    // return

    const { priceAfterFee: buyPriceAfterFee2, creatorFee: creatorFee2 } = await f.indieX.getBuyPriceAfterFee(
      creation.id,
      amount,
      creation.appId,
    )

    const tx2 = await f.indieX.connect(f.user1).buy(creation.id, amount, ZeroAddress, { value: buyPriceAfterFee2 })
    await tx2.wait()

    const spaceEthBalance2 = await ethers.provider.getBalance(spaceAddr)

    // expect(spaceEthBalance2 - spaceEthBalance1).to.equal(creatorFee2 / 2n)

    {
      const tx = await space.connect(f.user0).upsertCollaborators([
        {
          share: precision.token(50),
          account: f.user1.address,
        },
      ])
      await tx.wait()
      const collaborators = await space.getCollaborators()
      expect(collaborators.length).to.equal(2)
    }

    {
      await buy(space, precision.token(1), f.deployer)
      await approve(space, spaceAddr, 2000000n, f.deployer)
      await stake(space, f.deployer, 2000000n)
      const dis = await space.distribute()
      await dis.wait()
      const stakingInfo = await space.getStakingInfo()
      console.log(
        '=====stakingInfo:',
        stakingInfo,
        stakingInfo.accumulatedRewardsPerToken,
        precision.toDecimal(stakingInfo.accumulatedRewardsPerToken),
      )
    }

    //
    await buy(space, precision.token(1), f.user1)
    const user1TokenBalance = await space.balanceOf(f.user1)

    // console.log('========tokenBalance:', user1TokenBalance, precision.toDecimal(user1TokenBalance))

    await buy(space, precision.token(1), f.user2)
    const user2TokenBalance = await space.balanceOf(f.user2)
    // console.log('=======user2=tokenBalance:', user2TokenBalance, precision.toDecimal(user2TokenBalance))

    await approve(space, spaceAddr, user1TokenBalance / 1n, f.user1)
    await stake(space, f.user1, user1TokenBalance / 1n)

    {
      const dis = await space.distribute()
      await dis.wait()

      const stakingInfo = await space.getStakingInfo()
      console.log(
        '=====stakingInfo:',
        stakingInfo,
        stakingInfo.accumulatedRewardsPerToken,
        precision.toDecimal(stakingInfo.accumulatedRewardsPerToken),
      )
    }

    await approve(space, spaceAddr, user2TokenBalance / 1n, f.user2)
    await stake(space, f.user2, user2TokenBalance / 1n)

    {
      const dis = await space.distribute()
      await dis.wait()
      const stakingInfo = await space.getStakingInfo()
      console.log(
        '=====stakingInfo:',
        stakingInfo,
        stakingInfo.accumulatedRewardsPerToken,
        precision.toDecimal(stakingInfo.accumulatedRewardsPerToken),
      )
    }

    {
      await buy(space, precision.token(1), f.deployer)
      await approve(space, spaceAddr, 2000000n, f.deployer)
      await stake(space, f.deployer, 2000000n)
      const dis = await space.distribute()
      await dis.wait()
      const stakingInfo = await space.getStakingInfo()
      console.log(
        '=====stakingInfo:',
        stakingInfo,
        stakingInfo.accumulatedRewardsPerToken,
        precision.toDecimal(stakingInfo.accumulatedRewardsPerToken),
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
      precision.toDecimal(user1Rewards + user2Rewards + deployerRewards),
    )

    const spaceEthBalance3 = await ethers.provider.getBalance(spaceAddr)
    console.log('===eth spaceEthBalance3:', spaceEthBalance3, precision.toDecimal(spaceEthBalance3))

    await buy(space, precision.token(1), f.user3)
    const user3TokenBalance = await space.balanceOf(f.user3)

    await buy(space, precision.token(1), f.user4)
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
    console.log('eth========spaceEthBalance3:', spaceEthBalance3, precision.toDecimal(spaceEthBalance3))

    const user3Rewards = await space.currentUserRewards(f.user3)
    const user4Rewards = await space.currentUserRewards(f.user4)

    console.log(
      '=====user1Rewards:',
      user1Rewards,
      precision.toDecimal(user1Rewards),
      'user2Rewards:',
      user2Rewards,
      precision.toDecimal(user2Rewards),
      'user3Rewards:',
      user3Rewards,
      precision.toDecimal(user3Rewards),
      'user4Rewards:',
      user4Rewards,
      precision.toDecimal(user4Rewards),
    )
  })
})

async function getSpace(addr: string) {
  return ethers.getContractAt('Space', addr) as any as Promise<Space>
}

async function buy(token: Space, amount: bigint, account: HardhatEthersSigner) {
  const tx = await token.connect(account).buy({
    value: amount,
  })
  await tx.wait()
}

export async function approve(token: Space, spender: string, value: bigint, account: HardhatEthersSigner) {
  const tx = await token.connect(account).approve(spender, value)
  await tx.wait()
}

export async function stake(space: StakingRewards, account: HardhatEthersSigner, amount: bigint) {
  const tx = await space.connect(account).stake(amount)
  await tx.wait()
}
