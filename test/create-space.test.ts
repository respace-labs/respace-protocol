import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import {
  DEFAULT_SUBSCRIPTION_PRICE,
  getSpace,
  getTokenAmount,
  initialK,
  initialX,
  initialY,
  PREMINT_ETH_AMOUNT,
} from './utils'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'

describe('Create space', function () {
  let f: Fixture

  const price = precision.token('0.01024')

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('check default state', async () => {
    const index0 = await f.spaceFactory.spaceIndex()
    expect(index0).to.equal(0n)
  })

  it('should create space successfully', async () => {
    const spaceName = 'Test space'
    const symbolName = 'TEST'
    const uri = 'qwertyuiop'

    const factoryEthBalance0 = await ethers.provider.getBalance(f.spaceFactoryAddr)

    const tx0 = await f.spaceFactory.connect(f.user1).createSpace(
      {
        appId: 0,
        spaceName,
        symbol: symbolName,
        uri,
        preBuyEthAmount: 0,
      },
      { value: price },
    )
    await tx0.wait()

    const now = await time.latest()

    // index should increase
    const index = await f.spaceFactory.spaceIndex()
    expect(index).to.equal(1n)

    // user spaces
    const userSpaces = await f.spaceFactory.getUserSpaces(f.user1.address)
    expect(userSpaces.length).to.equal(1)

    // check space address
    const spaceArr = await f.spaceFactory.spaces(index - 1n)
    expect(spaceArr).to.equal(userSpaces[0])

    // creator should be founder
    const founder = await f.spaceFactory.spaceToFounder(spaceArr)
    expect(founder).to.equal(f.user1.address)

    // check factory eth balance
    const factoryEthBalance1 = await ethers.provider.getBalance(f.spaceFactoryAddr)
    expect(factoryEthBalance1 - factoryEthBalance0).to.equal(price)

    const space = await getSpace(spaceArr)

    const totalSupply = await space.totalSupply()
    const spaceBalance = await space.balanceOf(spaceArr)

    const { tokenAmount, newX, newY, newK } = getTokenAmount(initialX, initialY, initialK, PREMINT_ETH_AMOUNT)

    expect(await space.name()).to.equal(spaceName)
    expect(await space.symbol()).to.equal(symbolName)
    expect(await space.owner()).to.equal(f.user1.address)
    expect(await space.factory()).to.equal(f.spaceFactoryAddr)
    expect(await space.appId()).to.equal(0n)
    expect(await space.uri()).to.equal(uri)
    expect(totalSupply).to.equal(spaceBalance)
    expect(tokenAmount).to.equal(tokenAmount)

    const [x, y, k] = await space.token()
    expect(x).to.equal(newX)
    expect(y).to.equal(newY)
    expect(k).to.equal(newK)

    const staking = await space.staking()
    expect(staking.yieldStartTime).to.equal(now)
    expect(staking.yieldAmount).to.equal(totalSupply)
    expect(staking.yieldReleased).to.equal(0)
    expect(staking.stakingRevenue).to.equal(0)
    expect(staking.totalStaked).to.equal(0)
    expect(staking.accumulatedRewardsPerToken).to.equal(0)

    const share = await space.share()
    expect(share.daoRevenue).to.equal(0)
    expect(share.accumulatedRewardsPerShare).to.equal(0)
    expect(share.orderIndex).to.equal(0)

    const contributors = await space.getContributors()
    expect(contributors.length).to.equal(1)
    expect(contributors[0].account).to.equal(f.user1)
    expect(contributors[0].rewards).to.equal(0)
    expect(contributors[0].checkpoint).to.equal(0)

    const member = await space.member()
    expect(member.planIndex).to.equal(1)
    expect(member.subscriptionIncome).to.equal(0)
    expect(member.subscriptionIndex).to.equal(0)

    const plans = await space.getPlans()
    expect(plans.length).to.equal(1)
    expect(plans[0].uri).to.equal('')
    expect(plans[0].price).to.equal(DEFAULT_SUBSCRIPTION_PRICE)
    expect(plans[0].minEthAmount).to.equal(0)
  })

  it('should be reverted with no-existed app', async () => {
    const spaceName = 'Test space'
    const symbolName = 'TEST'
    const uri = 'qwertyuiop'

    await expect(
      f.spaceFactory.connect(f.user1).createSpace(
        {
          appId: 10,
          spaceName,
          symbol: symbolName,
          uri,
          preBuyEthAmount: 0,
        },
        { value: price },
      ),
    ).to.revertedWithCustomError(f.spaceFactory, 'InvalidAppId')
  })

  it('check price', async () => {
    const spaceName = 'TEST'

    // Insufficient payment
    await expect(
      f.spaceFactory.connect(f.user1).createSpace(
        {
          appId: 0,
          spaceName,
          symbol: 'TEST',
          uri: '',
          preBuyEthAmount: 0,
        },
        { value: 0 },
      ),
    ).to.revertedWithCustomError(f.spaceCreator, 'InsufficientPayment')

    /** create after setPrice */
    const tx1 = await f.spaceFactory.connect(f.deployer).setPrice(precision.token(1))
    await tx1.wait()

    await expect(
      f.spaceFactory.connect(f.user1).createSpace(
        {
          appId: 0,
          spaceName,
          symbol: 'TEST',
          uri: '',
          preBuyEthAmount: 0,
        },
        { value: price },
      ),
    ).to.revertedWithCustomError(f.spaceCreator, 'InsufficientPayment')

    const factoryEthBalance0 = await ethers.provider.getBalance(f.spaceFactoryAddr)

    const tx2 = await f.spaceFactory.connect(f.user1).createSpace(
      {
        appId: 0,
        spaceName,
        symbol: 'TEST',
        uri: '',
        preBuyEthAmount: 0,
      },
      { value: precision.token(1) },
    )
    await tx2.wait()

    const factoryEthBalance1 = await ethers.provider.getBalance(f.spaceFactoryAddr)

    expect(factoryEthBalance1 - factoryEthBalance0).to.equal(precision.token(1))
  })

  it('createSpace with pre-buy', async () => {
    const preBuyEthAmount = precision.token('0.1')

    await expect(
      f.spaceFactory.connect(f.user1).createSpace(
        {
          appId: 0,
          spaceName: 'TEST',
          symbol: 'TEST',
          uri: '',
          preBuyEthAmount,
        },
        { value: price },
      ),
    ).to.revertedWithCustomError(f.spaceCreator, 'InsufficientPayment')

    const tx0 = await f.spaceFactory.connect(f.user1).createSpace(
      {
        appId: 0,
        spaceName: 'TEST',
        symbol: 'TEST',
        uri: '',
        preBuyEthAmount,
      },
      { value: price + preBuyEthAmount },
    )
    await tx0.wait()

    const spaceAddr = await f.spaceFactory.spaces(0n)
    const space = await getSpace(spaceAddr)

    const factoryEthBalance1 = await ethers.provider.getBalance(f.spaceFactoryAddr)
    const spaceEthBalance1 = await ethers.provider.getBalance(spaceAddr)

    expect(factoryEthBalance1).to.equal(price)
    expect(spaceEthBalance1).to.equal(precision.token(0.1))

    const factoryTokenBalance1 = await space.balanceOf(f.spaceFactoryAddr)
    const user1TokenBalance1 = await space.balanceOf(f.user1.address)
    const spaceTokenBalance1 = await space.balanceOf(spaceAddr)

    const supply = await space.totalSupply()
    const { tokenAmount: premint, newX, newY, newK } = getTokenAmount(initialX, initialY, initialK, PREMINT_ETH_AMOUNT)

    const { protocolFee, tokenAmountAfterFee, creatorFee } = getTokenAmount(newX, newY, newK, preBuyEthAmount)

    expect(supply).to.equal(spaceTokenBalance1 + user1TokenBalance1 + factoryTokenBalance1)

    expect(factoryTokenBalance1).to.equal(protocolFee + creatorFee)
    expect(user1TokenBalance1).to.equal(tokenAmountAfterFee)
    expect(spaceTokenBalance1).to.equal(premint)
  })
})
