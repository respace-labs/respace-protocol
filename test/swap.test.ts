import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space, Staking } from 'types'
import { approve, buy, createSpace } from './utils'

describe('Swap', function () {
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

    const space1SellInfo = await space1.getEthAmount(user1Space1Balance0)
    const space2BuyInfo = await space2.getTokenAmount(space1SellInfo.ethAmount)

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
})
