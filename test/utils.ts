import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture } from '@utils/deployFixture'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Space } from 'types'

export async function createSpace(f: Fixture, account: HardhatEthersSigner, name: string) {
  const tx = await f.spaceFactory.connect(account).createSpace(name, name)
  await tx.wait()
  const info = await f.spaceFactory.getUserLatestSpace(account.address)
  const addresses = await f.spaceFactory.getUserSpaces(account.address)
  const spaceAddr = addresses[addresses.length - 1]
  const space = await getSpace(spaceAddr)

  return { spaceAddr, space, info }
}

export async function getSpace(addr: string) {
  return ethers.getContractAt('Space', addr) as any as Promise<Space>
}

export async function approve(token: Space, spender: string, value: bigint, account: HardhatEthersSigner) {
  const tx = await token.connect(account).approve(spender, value)
  await tx.wait()
}

export async function buy(space: Space, account: HardhatEthersSigner, value: bigint) {
  const tx = await space.connect(account).buy({
    value: value,
  })
  await tx.wait()
}

export async function stake(space: Space, account: HardhatEthersSigner, amount: bigint) {
  await approve(space, await space.getAddress(), amount, account)
  const tx = await space.connect(account).stake(amount)
  await tx.wait()
}

export async function reconciliation(f: Fixture, space: Space) {
  const ethBalance = await ethers.provider.getBalance(await space.getAddress())
  const info = await space.getSpaceInfo()
  // TODO: not right
  expect(ethBalance).to.equal(info.daoFee + info.stakingFee)
}

export async function subscribeByToken(space: Space, account: HardhatEthersSigner, value: bigint) {
  const spaceAddr = await space.getAddress()
  await approve(space, spaceAddr, value, account)
  const tx = await space.connect(account).subscribeByToken(value)
  await tx.wait()
}

export async function unsubscribeByToken(space: Space, account: HardhatEthersSigner, amount: bigint) {
  const tx = await space.connect(account).unsubscribeByToken(amount)
  await tx.wait()
}

export async function distributeSubscriptionRewards(space: Space) {
  const tx = await space.distributeSubscriptionRewards()
  await tx.wait()
}

export async function distributeStakingRewards(space: Space) {
  const tx = await space.distributeStakingRewards()
  await tx.wait()
}
