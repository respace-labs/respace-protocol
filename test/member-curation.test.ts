import { Fixture, deployFixture } from '@utils/deployFixture'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { Space } from 'types'
import {
  createSpace,
  subscribeByEth,
  createCode,
  bindCode,
  SECONDS_PER_MONTH,
  distributeSubscriptionRewards,
} from './utils'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'

describe('Member curation', function () {
  let f: Fixture

  let space: Space
  let spaceAddr: string
  let premint = BigInt(0)
  let spaceOwner: HardhatEthersSigner

  let defaultPlanPrice = precision.token('0.002048')

  beforeEach(async () => {
    f = await deployFixture()
    const spaceName = 'Test Space'
    const res = await createSpace(f, f.user0, spaceName)
    space = res.space
    spaceOwner = f.user0
    spaceAddr = res.spaceAddr
    premint = res.premint
  })

  it('Test memberCount in curator', async () => {
    const code = 'User2Code0'

    // user1 creates a code
    await createCode(space, f.user1, code)

    // user1 invite user2
    await bindCode(space, f.user2, code)

    // user1 invite user3
    await bindCode(space, f.user3, code)

    // user2 subscribe by eth
    await subscribeByEth(space, f.user2, defaultPlanPrice)

    // user3 subscribe by eth
    await subscribeByEth(space, f.user3, defaultPlanPrice)

    // check memberCount in curator
    {
      const curator = await space.getReferralUser(f.user1.address)
      expect(curator.memberCount).to.equal(2)
    }

    // expired
    await time.increase(SECONDS_PER_MONTH * 2n)
    await distributeSubscriptionRewards(space)

    // expired, memberCount should be 0
    {
      const curator = await space.getReferralUser(f.user1.address)
      expect(curator.memberCount).to.equal(0n)
    }
  })
})
