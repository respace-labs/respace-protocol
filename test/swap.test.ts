import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space, Staking } from 'types'
import { approve, buy, createSpace, getEthAmount, getTokenAmount } from './utils'
import { token } from 'types/@openzeppelin/contracts'

describe.only('Swap', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('swap()', async () => {
    const { space: space1, spaceAddr: spaceAddr1 } = await createSpace(f, f.user0, 'SPACE1')
    const { space: space2, spaceAddr: spaceAddr2 } = await createSpace(f, f.user0, 'SPACE2')

    const { tokenAmountAfterFee } = await buy(space1, f.user1, precision.token(1))
    const user1Space1Balance0 = await space1.balanceOf(f.user1)
    const user1Space2Balance0 = await space2.balanceOf(f.user1)

    expect(user1Space1Balance0).to.equal(tokenAmountAfterFee)
    expect(user1Space2Balance0).to.equal(0)

    const space2EthBalance0 = await ethers.provider.getBalance(spaceAddr2)
    expect(space2EthBalance0).to.equal(0)

    const token1 = await space1.token()
    const token2 = await space2.token()
    const space1SellInfo = getEthAmount(token1.x, token1.y, token1.k, user1Space1Balance0)
    const space2BuyInfo = getTokenAmount(token2.x, token2.y, token2.k, space1SellInfo.ethAmount)

    await approve(space1, f.user1, user1Space1Balance0, f.spaceFactoryAddr)

    const tx = await f.spaceFactory.connect(f.user1).swap(spaceAddr1, spaceAddr2, user1Space1Balance0, 0)
    await tx.wait()

    // space2 ether balance after swap
    const space2EthBalance1 = await ethers.provider.getBalance(spaceAddr2)
    expect(space2EthBalance1).to.equal(space1SellInfo.ethAmount)

    const user1Space1Balance1 = await space1.balanceOf(f.user1)
    const user1Space2Balance1 = await space2.balanceOf(f.user1)

    expect(user1Space1Balance1).to.equal(0)

    expect(user1Space2Balance1).to.equal(
      space2BuyInfo.tokenAmountAfterFee + space2BuyInfo.creatorFee + space2BuyInfo.protocolFee,
    )
  })

  it('should revert when swapping invalid tokens', async () => {
    const { spaceAddr: spaceAddr1 } = await createSpace(f, f.user0, 'SPACE1')

    // Test case 1: Attempt to swap a token with itself
    await expect(f.spaceFactory.connect(f.user1).swap(spaceAddr1, spaceAddr1, 100, 0)).to.be.revertedWithCustomError(
      f.spaceHelper,
      'InvalidTokens',
    )

    // Test case 2: Attempt to swap with an invalid input token (non-space address)
    await expect(
      f.spaceFactory.connect(f.user1).swap(f.user0.address, spaceAddr1, 100, 0),
    ).to.be.revertedWithCustomError(f.spaceHelper, 'InvalidTokens')

    // Test case 3: Attempt to swap with an invalid output token (non-space address)
    await expect(
      f.spaceFactory.connect(f.user1).swap(spaceAddr1, f.user0.address, 100, 0),
    ).to.be.revertedWithCustomError(f.spaceHelper, 'InvalidTokens')

    // Test case 4: Attempt to swap with tokens that are not registered spaces
    await expect(
      f.spaceFactory.connect(f.user1).swap(f.user0.address, f.user1.address, 100, 0),
    ).to.be.revertedWithCustomError(f.spaceHelper, 'InvalidTokens')

    // Test case 5: Attempt to swap with zero address as input token
    await expect(
      f.spaceFactory.connect(f.user1).swap(ethers.ZeroAddress, spaceAddr1, 100, 0),
    ).to.be.revertedWithCustomError(f.spaceHelper, 'InvalidTokens')

    // Test case 6: Attempt to swap with zero address as output token
    await expect(
      f.spaceFactory.connect(f.user1).swap(spaceAddr1, ethers.ZeroAddress, 100, 0),
    ).to.be.revertedWithCustomError(f.spaceHelper, 'InvalidTokens')

    // Test case 7: Attempt to swap with zero address for both input and output tokens
    await expect(
      f.spaceFactory.connect(f.user1).swap(ethers.ZeroAddress, ethers.ZeroAddress, 100, 0),
    ).to.be.revertedWithCustomError(f.spaceHelper, 'InvalidTokens')
  })
})
