import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space } from 'types'
import { bindCode, createCode, createSpace, getContributor, getSpaceInfo, SHARES_SUPPLY, stringToCode } from './utils'

describe('Curation', function () {
  let f: Fixture
  let space: Space
  let spaceAddr: string
  let premint = BigInt(0)

  beforeEach(async () => {
    f = await deployFixture()
    const spaceName = 'Test Space'
    const res = await createSpace(f, f.user0, spaceName)
    space = res.space
    spaceAddr = res.spaceAddr
    premint = res.premint
  })

  it('Tiers', async () => {
    const tier1 = await space.getTier(0)
    expect(tier1.memberCountBreakpoint).to.equal(10)
    expect(tier1.rebateRate).to.equal(precision.token(0.1))

    const tier2 = await space.getTier(1)
    expect(tier2.memberCountBreakpoint).to.equal(20)
    expect(tier2.rebateRate).to.equal(precision.token(0.2))

    const tier3 = await space.getTier(2)
    expect(tier3.memberCountBreakpoint).to.equal(40)
    expect(tier3.rebateRate).to.equal(precision.token(0.4))

    await expect(space.connect(f.user1).updateTier(0n, 20n, precision.token(0.2))).to.revertedWithCustomError(
      space,
      'OwnableUnauthorizedAccount',
    )

    {
      await space.connect(f.user0).updateTier(0n, 20n, precision.token(0.2))
      const tier1 = await space.getTier(0)
      expect(tier1.memberCountBreakpoint).to.equal(20)
      expect(tier1.rebateRate).to.equal(precision.token(0.2))
    }

    {
      await space.connect(f.user0).updateTier(1n, 30n, precision.token(0.3))
      const tier2 = await space.getTier(1)
      expect(tier2.memberCountBreakpoint).to.equal(30)
      expect(tier2.rebateRate).to.equal(precision.token(0.3))
    }

    {
      await space.connect(f.user0).updateTier(2n, 50n, precision.token(0.5))
      const tier3 = await space.getTier(2)
      expect(tier3.memberCountBreakpoint).to.equal(50)
      expect(tier3.rebateRate).to.equal(precision.token(0.5))
    }
  })

  it('createCode()', async () => {
    await expect(createCode(space, f.user1, '')).to.revertedWithCustomError(f.curation, 'CodeIsEmpty')

    const code = stringToCode('QWERTY')

    // create code
    await expect(space.connect(f.user1).createCode(code)).to.emit(space, 'CodeCreated').withArgs(f.user1.address, code)

    const user = await space.getCurationUser(f.user1.address)
    expect(user.curator).to.equal(ZeroAddress)
    expect(user.rewards).to.equal(0n)
    expect(user.memberCount).to.equal(0n)
    expect(user.registered).to.equal(true)

    const codeOnChain = await space.getCodeByCurator(f.user1.address)
    expect(codeOnChain).to.equal(code)

    const curator = await space.getCuratorByCode(code)
    expect(curator).to.equal(f.user1.address)

    // create with same code
    await expect(space.connect(f.user1).createCode(code)).to.revertedWithCustomError(f.curation, 'CodeAlreadyExists')
  })

  it('updateCode()', async () => {
    const oldCode = 'User1Code0'
    // create code
    await createCode(space, f.user1, oldCode)
    await createCode(space, f.user2, 'User2Code0')

    await expect(space.connect(f.user1).updateCode(stringToCode(''))).to.revertedWithCustomError(
      f.curation,
      'CodeIsEmpty',
    )

    await expect(space.connect(f.user3).updateCode(stringToCode('User1Code1'))).to.revertedWithCustomError(
      f.curation,
      'ShouldCreateCodeFirstly',
    )

    await expect(space.connect(f.user1).updateCode(stringToCode('User2Code0'))).to.revertedWithCustomError(
      f.curation,
      'CodeIsUsed',
    )

    const newCode = stringToCode('User1Code1')

    const tx = await space.connect(f.user1).updateCode(newCode)
    await tx.wait()

    {
      const user = await space.getCurationUser(f.user1.address)
      expect(user.curator).to.equal(ZeroAddress)
      expect(user.rewards).to.equal(0n)
      expect(user.memberCount).to.equal(0n)
      expect(user.registered).to.equal(true)
    }

    {
      const user = await space.getCurationUserByCode(newCode)
      expect(user.curator).to.equal(ZeroAddress)
      expect(user.rewards).to.equal(0n)
      expect(user.memberCount).to.equal(0n)
      expect(user.registered).to.equal(true)
    }

    const codeOnChain = await space.getCodeByCurator(f.user1.address)
    expect(codeOnChain).to.equal(newCode)

    const curator = await space.getCuratorByCode(newCode)
    expect(curator).to.equal(f.user1.address)

    const oldCurator = await space.getCuratorByCode(stringToCode(oldCode))

    expect(oldCurator).to.equal(ZeroAddress)
  })

  it('bindCode()', async () => {
    // create code
    await createCode(space, f.user1, 'User1Code0')
    await createCode(space, f.user2, 'User2Code0')

    await expect(space.connect(f.user3).bindCode(stringToCode(''))).to.revertedWithCustomError(
      f.curation,
      'CodeIsEmpty',
    )

    await expect(space.connect(f.user3).bindCode(stringToCode('XXX'))).to.revertedWithCustomError(
      f.curation,
      'CodeNotExists',
    )

    // use self code
    await expect(space.connect(f.user1).bindCode(stringToCode('User1Code0'))).to.revertedWithCustomError(
      f.curation,
      'CannotInviteYourself',
    )

    // user2 invite user1 successfully
    await bindCode(space, f.user1, 'User2Code0')

    const user1 = await space.getCurationUser(f.user1.address)
    expect(user1.curator).to.equal(f.user2.address)
    expect(user1.rewards).to.equal(0n)
    expect(user1.memberCount).to.equal(0n)
    expect(user1.registered).to.equal(true)

    await expect(bindCode(space, f.user1, 'User2Code0')).to.revertedWithCustomError(f.curation, 'UserIsInvited')

    {
      const user2 = await space.getCurationUser(f.user2.address)
      expect(user2.curator).to.equal(ZeroAddress)
      expect(user2.rewards).to.equal(0n)
      expect(user2.memberCount).to.equal(0n)
      expect(user2.registered).to.equal(true)
    }

    {
      const user3 = await space.getCurationUser(f.user3.address)
      expect(user3.curator).to.equal(ZeroAddress)
      expect(user3.rewards).to.equal(0n)
      expect(user3.memberCount).to.equal(0n)
      expect(user3.registered).to.equal(false)
    }

    // user2 invite user3 successfully
    await bindCode(space, f.user3, 'User2Code0')

    {
      const user3 = await space.getCurationUser(f.user3.address)
      expect(user3.curator).to.equal(f.user2.address)
      expect(user3.rewards).to.equal(0n)
      expect(user3.memberCount).to.equal(0n)
      expect(user3.registered).to.equal(true)
    }

    const user3Code = await space.getCodeByCurator(f.user3.address)
    expect(user3Code).to.equal(stringToCode(''))
  })
})
