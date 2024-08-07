import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { precision } from '@utils/precision'
import { BlankFarmer, IndieX, USDC } from 'types'

const func: DeployFunction = async (hre) => {
  const { deployer, keeper } = await hre.getNamedAccounts()

  const factory = await ethers.getContract<IndieX>('IndieX')
  const usdc = await ethers.getContract<USDC>('USDC')

  const appIndex = await factory.appIndex()

  {
    const tx = await factory.setProtocolFeeTo(deployer)
    await tx.wait()
  }

  {
    if (appIndex === 0n) {
      const tx = await factory.newApp({
        name: 'Genesis App',
        uri: '',
        feeTo: deployer,
        appFeePercent: precision.token(0, 16),
        creatorFeePercent: precision.token(5, 16),
      })
      await tx.wait()

      await (
        await factory.newApp({
          name: 'Remirror',
          uri: '',
          feeTo: deployer,
          appFeePercent: precision.token(2, 16),
          creatorFeePercent: precision.token(5, 16),
        })
      ).wait()

      await (
        await factory.newApp({
          name: 'Sponsor3',
          uri: '',
          feeTo: deployer,
          appFeePercent: precision.token(2, 16),
          creatorFeePercent: precision.token(5, 16),
        })
      ).wait()
    }
  }

  const blankFramer = await ethers.getContract<BlankFarmer>('BlankFarmer')

  {
    const tx = await factory.addFarmer(await blankFramer.getAddress())
    await tx.wait()
  }

  {
    const tx = await usdc.mint(deployer, precision.token(100_000_000, 6))
    await tx.wait()
  }

  {
    const tx = await factory.setUSDC(await usdc.getAddress())
    await tx.wait()
  }
}

func.id = 'Init'
func.tags = ['Init']
func.dependencies = ['IndieX', 'USDC', 'BlankFarmer']
export default func
