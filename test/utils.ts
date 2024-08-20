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

export async function reconciliation(f: Fixture, space: Space) {
  const ethBalance = await ethers.provider.getBalance(await space.getAddress())
  const info = await space.getSpaceInfo()
  // TODO: not right
  expect(ethBalance).to.equal(info.daoFees + info.stakingFees)
}
