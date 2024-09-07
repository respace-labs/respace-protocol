import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import {
  approve,
  buy,
  claimStakingRewards,
  createSpace,
  getEthAmount,
  getSpaceInfo,
  getTokenAmount,
  initialK,
  initialX,
  initialY,
  looseEqual,
  PREMINT_ETH_AMOUNT,
  sell,
  SpaceInfo,
  stake,
} from './utils'
import { Space } from 'types'
import { time } from '@nomicfoundation/hardhat-network-helpers'

function amount(v: any) {
  return precision.token(v)
}

const GAS_PRICE = 800000000n

describe('Token', function () {
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

  it('Deploy', async () => {
    const { newX, newY, newK, tokenAmount } = getTokenAmount(initialX, initialY, initialK, PREMINT_ETH_AMOUNT)

    const supply = await space.totalSupply()
    expect(supply).to.be.equal(tokenAmount)
    expect(info.x).to.be.equal(newX)
    expect(info.y).to.be.equal(newY)
    expect(info.k).to.be.equal(newK)
    expect(info.x * info.y).to.be.equal(newK)

    console.log('========info.yieldStartTime:', info.yieldStartTime)

    expect(supply).to.equal(premint)
    expect(info.yieldStartTime).to.equal(await time.latest())
    expect(info.yieldAmount).to.equal(premint)
    expect(info.yieldReleased).to.equal(0)

    const ethBalance = await ethers.provider.getBalance(spaceAddr)
    expect(ethBalance).to.equal(0)
  })

  it('Simple buy, 1 user buy 1eth', async () => {
    const { spaceAddr, space, info } = await createSpace(f, f.user0, 'TEST')
    const user1Balance0 = await space.balanceOf(f.user1)
    expect(user1Balance0).to.be.equal(0)

    await expect(buy(space, f.user1, 0n)).to.revertedWith('ETH amount must be greater than zero')

    // user1 buy 1 eth
    const { x, y, k } = info
    await buy(space, f.user1, amount(1))

    const supply = await space.totalSupply()
    const { tokenAmount, tokenAmountAfterFee, creatorFee, protocolFee } = getTokenAmount(x, y, k, amount(1))

    expect(supply).to.equal(tokenAmount + premint)
    expect(tokenAmount).to.equal(tokenAmountAfterFee + creatorFee + protocolFee)

    const user1Balance1 = await space.balanceOf(f.user1)
    expect(user1Balance1).to.equal(tokenAmountAfterFee)

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.equal(creatorFee + premint)

    const factoryBalance1 = await space.balanceOf(f.spaceFactoryAddr)
    expect(factoryBalance1).to.equal(protocolFee)

    const ethBalance = await ethers.provider.getBalance(spaceAddr)
    expect(amount(1)).to.equal(ethBalance)
  })

  it('Advanced buy() ', async () => {
    const { spaceAddr, space, info: info1 } = await createSpace(f, f.user0, 'TEST')
    const user1Balance0 = await space.balanceOf(f.user1)
    expect(user1Balance0).to.be.equal(0)

    let totalGasCost = 0n

    const user1EthBalance0 = await ethers.provider.getBalance(f.user1)
    const user2EthBalance0 = await ethers.provider.getBalance(f.user2)
    const user3EthBalance0 = await ethers.provider.getBalance(f.user3)

    /** user1 buy 1 eth */
    const { gasCost: gasCost1 } = await buy(space, f.user1, amount(1))

    totalGasCost += gasCost1

    const supply1 = await space.totalSupply()
    const buyInfo1 = getTokenAmount(info1.x, info1.y, info1.k, amount(1))
    expect(supply1).to.equal(buyInfo1.tokenAmount + premint)

    const user1Balance1 = await space.balanceOf(f.user1)
    expect(user1Balance1).to.equal(buyInfo1.tokenAmountAfterFee)

    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.equal(buyInfo1.creatorFee + premint)

    const factoryBalance1 = await space.balanceOf(f.spaceFactoryAddr)
    expect(factoryBalance1).to.equal(buyInfo1.protocolFee)

    const ethBalance1 = await ethers.provider.getBalance(spaceAddr)
    expect(amount(1)).to.equal(ethBalance1)

    /** user2 buy 1 eth */
    const info2 = await getSpaceInfo(space)
    const { gasCost: gasCost2 } = await buy(space, f.user2, amount(1))

    totalGasCost += gasCost2

    const supply2 = await space.totalSupply()
    const buyInfo2 = getTokenAmount(info2.x, info2.y, info2.k, amount(1))
    expect(supply2).to.equal(buyInfo1.tokenAmount + buyInfo2.tokenAmount + premint)

    const user2Balance = await space.balanceOf(f.user2)
    expect(user2Balance).to.equal(buyInfo2.tokenAmountAfterFee)

    const spaceBalance2 = await space.balanceOf(spaceAddr)
    expect(spaceBalance2).to.equal(buyInfo2.creatorFee + buyInfo1.creatorFee + premint)

    const factoryBalance2 = await space.balanceOf(f.spaceFactoryAddr)
    expect(factoryBalance2).to.equal(buyInfo2.protocolFee + buyInfo1.protocolFee)

    const ethBalance2 = await ethers.provider.getBalance(spaceAddr)
    expect(amount(2)).to.equal(ethBalance2)

    /** user3 buy 1 eth */
    const info3 = await getSpaceInfo(space)
    const { gasCost: gasCost3 } = await buy(space, f.user3, amount(1))

    totalGasCost += gasCost3

    const supply3 = await space.totalSupply()
    const buyInfo3 = getTokenAmount(info3.x, info3.y, info3.k, amount(1))
    expect(supply3).to.equal(buyInfo1.tokenAmount + buyInfo2.tokenAmount + buyInfo3.tokenAmount + premint)

    const user3Balance = await space.balanceOf(f.user3)
    expect(user3Balance).to.equal(buyInfo3.tokenAmountAfterFee)

    const spaceBalance3 = await space.balanceOf(spaceAddr)
    expect(spaceBalance3).to.equal(buyInfo3.creatorFee + buyInfo2.creatorFee + buyInfo1.creatorFee + premint)

    const factoryBalance3 = await space.balanceOf(f.spaceFactoryAddr)
    expect(factoryBalance3).to.equal(buyInfo3.protocolFee + buyInfo2.protocolFee + buyInfo1.protocolFee)

    const ethBalance3 = await ethers.provider.getBalance(spaceAddr)
    expect(amount(3)).to.equal(ethBalance3)

    // user1 buy 0.5 eth
    const info4 = await getSpaceInfo(space)
    const { gasCost: gasCost4, creatorFee, tokenAmountAfterFee } = await buy(space, f.user1, amount('0.5'))

    totalGasCost += gasCost4

    const supply4 = await space.totalSupply()
    const buyInfo4 = getTokenAmount(info4.x, info4.y, info4.k, amount('0.5'))

    expect(supply4).to.equal(
      buyInfo1.tokenAmount + buyInfo2.tokenAmount + buyInfo3.tokenAmount + buyInfo4.tokenAmount + premint,
    )

    const user1Balance2 = await space.balanceOf(f.user1)
    expect(user1Balance2).to.equal(buyInfo4.tokenAmountAfterFee + buyInfo1.tokenAmountAfterFee)

    const spaceBalance4 = await space.balanceOf(spaceAddr)
    expect(spaceBalance4).to.equal(
      buyInfo4.creatorFee + buyInfo3.creatorFee + buyInfo2.creatorFee + buyInfo1.creatorFee + premint,
    )

    const factoryBalance4 = await space.balanceOf(f.spaceFactoryAddr)
    expect(factoryBalance4).to.equal(
      buyInfo4.protocolFee + buyInfo3.protocolFee + buyInfo2.protocolFee + buyInfo1.protocolFee,
    )

    const ethBalance4 = await ethers.provider.getBalance(spaceAddr)
    expect(amount('3.5')).to.equal(ethBalance4)

    // check eth balance
    {
      const user1EthBalance1 = await ethers.provider.getBalance(f.user1)
      const user2EthBalance1 = await ethers.provider.getBalance(f.user2)
      const user3EthBalance1 = await ethers.provider.getBalance(f.user3)
      const ethBalance = await ethers.provider.getBalance(spaceAddr)

      expect(ethBalance).to.equal(
        user1EthBalance0 -
          user1EthBalance1 +
          (user2EthBalance0 - user2EthBalance1) +
          (user3EthBalance0 - user3EthBalance1) -
          totalGasCost,
      )
    }
  })

  it('Check buy amount step by step', async () => {
    // await buy(space, f.user1, amount(1))
    // await buy(space, f.user2, amount(1))
    // await buy(space, f.user3, amount(1))
    // await buy(space, f.user1, precision.token(5, 17))
    // const supply = await space.totalSupply()
    // console.log('------supply:', supply)

    // return
    // supply from above commented codes
    const supplyStepByStep = 566070966905511811023622046n

    // await buy(f, precision.token(5, 17), f.user4)
    const { creatorFee, protocolFee } = await buy(space, f.user4, precision.token(3) + precision.token(5, 17))

    const supplyOneTimes = await space.totalSupply()
    const user4Balance = await space.balanceOf(f.user4)

    expect(supplyOneTimes - supplyStepByStep).to.lessThan(5n)
    expect(supplyOneTimes).to.equal(user4Balance + creatorFee + protocolFee + premint)
  })

  it('Sell fail when no balance', async () => {
    const user1Balance0 = await space.balanceOf(f.user1)
    expect(user1Balance0).to.be.equal(0)

    await expect(sell(space, f.user1, 0n)).to.revertedWith('Token amount must be greater than zero')

    await expect(sell(space, f.user1, amount(1))).to.revertedWithCustomError(space, 'ERC20InsufficientBalance')
  })

  it('Should emit if buy successfully', async () => {
    // user1 buy 1 eth
    await buy(space, f.user1, amount(1))

    const tokenAmount = await space.balanceOf(f.user1)
    const spaceInfo = await getSpaceInfo(space)
    const { x, y, k } = spaceInfo
    const sellInfo = getEthAmount(x, y, k, tokenAmount)

    await approve(space, f.user1, tokenAmount)

    await expect(
      space.connect(f.user1).sell(tokenAmount, 0, {
        gasPrice: GAS_PRICE,
      }),
    )
      .to.emit(space, 'Trade')
      .withArgs(1n, f.user1, sellInfo.ethAmount, tokenAmount, sellInfo.creatorFee, sellInfo.protocolFee)
  })

  it('Simple buy and sell in one user', async () => {
    // user1 buy 1 eth
    const buyInfo = await buy(space, f.user1, amount(1))

    const tokenAmount0 = await space.balanceOf(f.user1)
    const ethBalance0 = await ethers.provider.getBalance(f.user1)

    const { x, y, k } = await getSpaceInfo(space)
    const ethAmount = getEthAmount(x, y, k, tokenAmount0)

    // sell all tokens
    const sellInfo = await sell(space, f.user1, tokenAmount0)
    const ethBalance1 = await ethers.provider.getBalance(f.user1)

    const userTokenBalance1 = await space.balanceOf(f.user1)
    const spaceTokenBalance = await space.balanceOf(space)

    expect(userTokenBalance1).to.equal(0)
    expect(spaceTokenBalance).to.equal(buyInfo.creatorFee + sellInfo.creatorFee + premint)
  })

  it('complex buy and sell', async () => {
    const { spaceAddr, space, info } = await createSpace(f, f.user0, 'TEST')
    const user1Balance0 = await space.balanceOf(f.user1)
    expect(user1Balance0).to.be.equal(0)

    const user1EthBalance0 = await ethers.provider.getBalance(f.user1)

    await buy(space, f.user1, amount(1))
    await buy(space, f.user2, amount(1))
    await buy(space, f.user3, amount(1))

    const user1EthBalance1 = await ethers.provider.getBalance(f.user1)
    expect(user1EthBalance1 - user1EthBalance0).to.lessThan(0)

    const user1TokenBalance0 = await space.balanceOf(f.user1)

    await sell(space, f.user1, user1TokenBalance0)

    const user1EthBalance2 = await ethers.provider.getBalance(f.user1)
    expect(user1EthBalance2 - user1EthBalance0).to.greaterThan(0)
  })

  /**
   * case step:
   * 1. space created
   * 2. after 3 years
   * 3. user1 claims staking rewards
   * 4. user1 buy eth eth
   * 5. user1 stake all own tokens
   * 6. after 3 years
   * 7. user1 claims staking rewards
   */
  it('Sell fail after all yield released', async () => {
    const spaceBalance1 = await space.balanceOf(spaceAddr)
    expect(spaceBalance1).to.equal(premint)

    const info0 = await getSpaceInfo(space)
    expect(info0.stakingFee).to.equal(0)

    // step 2
    await time.increase(60 * 60 * 24 * 365 * 3) // after 3 years

    // step 3
    await claimStakingRewards(space, f.user1)

    const info1 = await getSpaceInfo(space)
    expect(info1.stakingFee).to.equal(premint)

    // step 4
    const { tokenAmountAfterFee } = await buy(space, f.user1, amount(1))

    const user1Balance1 = await space.balanceOf(f.user1.address)
    expect(user1Balance1).to.equal(tokenAmountAfterFee)

    // step 5
    await stake(space, f.user1, user1Balance1)

    // step 6
    await time.increase(60 * 60 * 24 * 365 * 3) // after 3 years

    // step 7
    await claimStakingRewards(space, f.user1)

    /** all premint token should be release to user1 */
    const user1Balance2 = await space.balanceOf(f.user1.address)
    looseEqual(user1Balance2, premint)

    // user1 try to sell all token after all yield released
    await expect(sell(space, f.user1, user1Balance2)).to.revertedWith('Token amount to large')

    // user1
    await sell(space, f.user1, tokenAmountAfterFee)

    await expect(sell(space, f.user1, tokenAmountAfterFee)).to.revertedWith('Token amount to large')
  })

  it('Buy with many eth', async () => {
    const { space } = await createSpace(f, f.user0, 'Test')
    await buy(space, f.user1, precision.token(9000))
    await buy(space, f.user2, precision.token(9000))
    await buy(space, f.user3, precision.token(9000))
    await buy(space, f.user4, precision.token(9000))
    await buy(space, f.user5, precision.token(9000))
    await buy(space, f.user6, precision.token(9000))
    await buy(space, f.user7, precision.token(9000))
    await buy(space, f.user8, precision.token(9000))
    await buy(space, f.user9, precision.token(9000))
    await buy(space, f.user10, precision.token(9000))
    await buy(space, f.user11, precision.token(9000))
    await buy(space, f.user12, precision.token(9000))
    await buy(space, f.user13, precision.token(9000))
    await buy(space, f.user14, precision.token(9000))
    await buy(space, f.user15, precision.token(9000))
    await buy(space, f.user16, precision.token(9000))
    await buy(space, f.user17, precision.token(9000))
    await buy(space, f.user18, precision.token(9000))

    // await buy(space, f.signer9, precision.token(1))

    await buy(space, f.user0, precision.token(1))
    const user0Balance0 = await space.balanceOf(f.user0.address)
  })

  it('Test Arr', async () => {
    const { spaceAddr, space, info } = await createSpace(f, f.user0, 'TEST')
    const arr = Array(100)
      .fill('')
      .map((_, i) => i + 1)

    for (const i of arr) {
      const balance0 = await space.balanceOf(f.user1)
      const tx2 = await space.connect(f.user1).buy(0n, { value: precision.token(1) })
      await tx2.wait()

      const balance1 = await space.balanceOf(f.user1)
      // console.log(
      //   'i>>>>>>>>:',
      //   i,
      //   balance1 - balance0,
      //   precision.decimal(balance1 - balance0),
      //   precision.decimal(balance1),
      //   1000000 / precision.decimal(balance1 - balance0),
      // )
    }
  })
})
