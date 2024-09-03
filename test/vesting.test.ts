import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { ethers } from 'hardhat'
import { Share, Space } from 'types'
import { createSpace, getSpace, SHARES_SUPPLY } from './utils'
import { time } from '@nomicfoundation/hardhat-network-helpers'

describe('Vesting', function () {
  let f: Fixture

  let space: Space
  beforeEach(async () => {
    f = await deployFixture()
    const spaceName = 'Test Space'
    const res = await createSpace(f, f.user0, spaceName)
    space = res.space
  })

  /**
   * case step:
   * 1. user0 add vesting to user1
   * 2. user0 add vesting to user2
   * 2. user0 remove vesting user1
   */
  it('Case1: add and remove vesting', async () => {
    const vestings0 = await space.getVestings()
    expect(vestings0.length).to.equal(0)

    const now = await time.latest()
    const duration = 60 * 60 * 24 * 30 // 30 days
    const allocation = 10000 // 10k

    await expect(space.connect(f.user0).addVesting(ZeroAddress, now, duration, allocation)).to.revertedWith(
      'Beneficiary is zero address',
    )

    await expect(space.connect(f.user9).addVesting(f.user1.address, now, duration, allocation)).to.revertedWith(
      'Allocation too large',
    )

    // step 1
    const tx0 = await space.connect(f.user0).addVesting(f.user1.address, now, duration, allocation)
    await tx0.wait()

    const vestings1 = await space.getVestings()
    expect(vestings1.length).to.equal(1)
    expect(vestings1[0].beneficiary).to.equal(f.user1.address)
    expect(vestings1[0].payer).to.equal(f.user0.address)
    expect(vestings1[0].start).to.equal(now)
    expect(vestings1[0].duration).to.equal(duration)
    expect(vestings1[0].allocation).to.equal(allocation)
    expect(vestings1[0].released).to.equal(0)

    const contributors1 = await space.getContributors()

    expect(contributors1.length).to.equal(2)
    expect(contributors1[0].shares).to.equal(SHARES_SUPPLY)
    expect(contributors1[1].shares).to.equal(0)

    await expect(space.connect(f.user0).addVesting(f.user1.address, now, duration, allocation)).to.revertedWith(
      'Beneficiary already exists',
    )

    // step 2
    const tx1 = await space.connect(f.user0).addVesting(f.user2.address, now, duration, allocation)
    await tx1.wait()

    const contributors2 = await space.getContributors()
    const vestings2 = await space.getVestings()
    expect(contributors2.length).to.equal(3)
    expect(vestings2.length).to.equal(2)

    await expect(space.connect(f.user0).removeVesting(f.user9.address)).to.revertedWith('Beneficiary does not exist')

    await expect(space.connect(f.user9).removeVesting(f.user1.address)).to.revertedWith('Only payer can remove vesting')

    // step3
    await space.connect(f.user0).removeVesting(f.user1.address)

    const contributors3 = await space.getContributors()
    const vestings3 = await space.getVestings()
    expect(contributors3.length).to.equal(3)
    expect(vestings3.length).to.equal(1)
  })

  it('Case2: add vesting to an existing contributor', async () => {
    const tx1 = await space.connect(f.user0).addContributor(f.user1.address)
    await tx1.wait()

    const now = await time.latest()
    const duration = 60 * 60 * 24 * 30 // 30 days
    const allocation = 10000 // 10k

    const tx2 = await space.connect(f.user0).addVesting(f.user1.address, now, duration, allocation)
    await tx2.wait()

    const vestings1 = await space.getVestings()
    expect(vestings1.length).to.equal(1)
    expect(vestings1[0].beneficiary).to.equal(f.user1.address)
    expect(vestings1[0].payer).to.equal(f.user0.address)
    expect(vestings1[0].start).to.equal(now)
    expect(vestings1[0].duration).to.equal(duration)
    expect(vestings1[0].allocation).to.equal(allocation)
    expect(vestings1[0].released).to.equal(0)

    const contributors1 = await space.getContributors()

    expect(contributors1.length).to.equal(2)
    expect(contributors1[0].shares).to.equal(SHARES_SUPPLY)
    expect(contributors1[1].shares).to.equal(0)
  })

  /**
   * case step:
   * 1. user0 add vesting to user1
   * 2. time increase duration/2
   * 3. claim vesting
   * 4. time increase duration/4
   * 5. claim vesting
   * 6. time increase duration
   * 7. claim vesting
   */
  it('Case3: release vesting', async () => {
    const start = await time.latest()
    const duration = 60 * 60 * 24 * 30 // 30 days
    const allocation = 10000 // 10k
    const user1 = f.user1

    // step 1
    const tx0 = await space.connect(f.user0).addVesting(user1.address, start, duration, allocation)
    await tx0.wait()

    const [vesting] = await space.getVestings()

    const vested0 = await space.vestedAmount(user1.address, start - 100)
    expect(vested0).to.equal(0)

    const vested1 = await space.vestedAmount(user1.address, start + duration)
    expect(vested1).to.equal(vesting.allocation)

    const vested2 = await space.vestedAmount(user1.address, start + duration + 100)
    expect(vested2).to.equal(vesting.allocation)

    const vested3 = await space.vestedAmount(user1.address, start + duration / 2)
    expect(vested3).to.equal(vesting.allocation / 2n)

    const vested4 = await space.vestedAmount(f.user9.address, duration)
    expect(vested4).to.equal(0)

    await expect(space.connect(f.user9).claimVesting()).to.revertedWith('Beneficiary does not exist')

    await expect(space.connect(f.user1).claimVesting()).to.revertedWith('No shares are due for release')

    // step 2
    await time.increase(duration / 2)

    const vested5 = await space.vestedAmount(user1.address, await time.latest())
    expect(vested5).to.equal(vesting.allocation / 2n)

    // step 3
    const tx1 = await space.connect(user1).claimVesting()
    await tx1.wait()

    const user1Contributor1 = await space.getContributor(user1.address)
    const [user1Vesting1] = await space.getVestings()

    expect(user1Contributor1.shares).to.equal(vested5)
    expect(user1Vesting1.released).to.equal(vested5)

    // step 4
    await time.increase(duration / 4)

    // step 5
    const tx2 = await space.connect(user1).claimVesting()
    await tx2.wait()

    const user1Contributor2 = await space.getContributor(user1.address)
    const [user1Vesting2] = await space.getVestings()

    expect(user1Contributor2.shares).to.equal((allocation * 3) / 4)
    expect(user1Vesting2.released).to.equal((allocation * 3) / 4)

    // step 6
    await time.increase(duration)

    // step 7
    const tx3 = await space.connect(user1).claimVesting()
    await tx3.wait()

    const user1Contributor3 = await space.getContributor(user1.address)
    const [user1Vesting3] = await space.getVestings()

    expect(user1Contributor3.shares).to.equal(allocation)
    expect(user1Vesting3.released).to.equal(allocation)
  })

  it('Case4: release vesting when insufficient shares', async () => {
    const start = await time.latest()
    const duration = 60 * 60 * 24 * 30 // 30 days
    const allocation = 10000 // 10k
    const user1 = f.user1

    const tx0 = await space.connect(f.user0).addVesting(user1.address, start, duration, allocation)
    await tx0.wait()

    const tx1 = await space.connect(f.user0).transferShares(f.user9.address, SHARES_SUPPLY)
    await tx1.wait()

    // step 2
    await time.increase(duration / 2)

    await expect(space.connect(user1).claimVesting()).to.revertedWith('Insufficient shares')
  })

  it('Case4: release vesting when payer remove vesting', async () => {
    const start = await time.latest()
    const duration = 60 * 60 * 24 * 30 // 30 days
    const allocation = 10000 // 10k
    const user1 = f.user1

    const tx0 = await space.connect(f.user0).addVesting(user1.address, start, duration, allocation)
    await tx0.wait()

    await time.increase(duration / 2)

    const tx2 = await space.connect(user1).claimVesting()
    await tx2.wait()

    const user1Contributor = await space.getContributor(user1.address)
    const [user1Vesting] = await space.getVestings()

    expect(user1Contributor.shares).to.equal(allocation / 2)
    expect(user1Vesting.released).to.equal(allocation / 2)

    const tx3 = await space.connect(f.user0).removeVesting(user1.address)
    await tx3.wait()

    await time.increase(duration / 2)

    await expect(space.connect(user1).claimVesting()).to.revertedWith('Beneficiary does not exist')
  })

  afterEach(async () => {
    const contributors = await space.getContributors()
    const shares = contributors.reduce((acc, contributor) => acc + contributor.shares, 0n)
    expect(shares).to.equal(SHARES_SUPPLY)
  })
})
