import { ethers } from 'hardhat'
import { SpaceFactory } from 'types'

// npx hardhat run --network arb_sepolia scripts/setFeeReceiver.ts

async function main() {
  const spaceFactory = (await ethers.getContractAt(
    'SpaceFactory',
    '0x698776D3caa1E2F8d054378ec722a6c2d06b1C34',
  )) as any as SpaceFactory

  const tx = await spaceFactory.setFeeReceiver('0x7FEA6971Eb1663623690Edbb779a05DD9440d824')
  await tx.wait()
}

main()
