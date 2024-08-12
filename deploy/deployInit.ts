import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { precision } from '@utils/precision'
import { BlankFarmer, IndieX } from 'types'

const func: DeployFunction = async (hre) => {
  const { deployer, keeper } = await hre.getNamedAccounts()

  const factory = await ethers.getContract<IndieX>('IndieX')

  const appIndex = await factory.appIndex()

  {
    const tx = await factory.setProtocolFeeTo(deployer)
    await tx.wait()
  }

  {
    if (appIndex === 0n) {
      const tx = await factory.newApp({
        uri: 'Genesis App',
        feeTo: deployer,
        appFeePercent: precision.token(0, 16),
        creatorFeePercent: precision.token(5, 16),
      })
      await tx.wait()

      await (
        await factory.newApp({
          uri: 'PenX',
          feeTo: deployer,
          appFeePercent: precision.token(2, 16),
          creatorFeePercent: precision.token(5, 16),
        })
      ).wait()

      await (
        await factory.newApp({
          uri: 'Sponsor3',
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
}

func.id = 'Init'
func.tags = ['Init']
func.dependencies = ['IndieX', 'BlankFarmer']
export default func
