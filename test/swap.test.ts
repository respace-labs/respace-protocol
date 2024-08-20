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

    await buy(space1, f.user1, precision.token(1))
    const space1BalanceOfUser1_0 = await space1.balanceOf(f.user1)
    const space2BalanceOfUser1_0 = await space2.balanceOf(f.user1)

    console.log('===space1BalanceOfUser1_0:', space1BalanceOfUser1_0)
    console.log('==space2BalanceOfUser1_0:', space2BalanceOfUser1_0)

    await approve(space1, f.spaceFactoryAddress, space1BalanceOfUser1_0, f.user1)
    const tx = await f.spaceFactory.connect(f.user1).swap(spaceAddr1, spaceAddr2, space1BalanceOfUser1_0)
    await tx.wait()

    const space1BalanceOfUser1_1 = await space1.balanceOf(f.user1)
    const space2BalanceOfUser1_1 = await space2.balanceOf(f.user1)

    console.log('===space1BalanceOfUser1_1:', space1BalanceOfUser1_1)
    console.log('==space2BalanceOfUser1_1:', space2BalanceOfUser1_1)
  })
})
