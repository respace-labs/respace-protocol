import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture } from '@utils/deployFixture'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { Space } from 'types'

export async function getSpace(addr: string) {
  return ethers.getContractAt('Space', addr) as any as Promise<Space>
}

export async function approve(token: Space, spender: string, value: bigint, account: HardhatEthersSigner) {
  const tx = await token.connect(account).approve(spender, value)
  await tx.wait()
}

export async function reconciliation(f: Fixture, space: Space) {
  const ethBalance = await ethers.provider.getBalance(await space.getAddress())
  const info = await space.getInfo()
  // TODO: not right
  expect(ethBalance).to.equal(info.daoFees + info.stakingFees)
}