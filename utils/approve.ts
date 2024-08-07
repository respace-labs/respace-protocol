import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { Fixture } from './deployFixture'

export async function approve(f: Fixture, spender: string, value: bigint, account?: HardhatEthersSigner) {
  const tx = await f.usdc.connect(account || f.user1).approve(spender, value)
  await tx.wait()
}
