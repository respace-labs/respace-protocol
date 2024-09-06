import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { precision } from '@utils/precision'
import { SpaceFactory } from 'types'

const func: DeployFunction = async (hre) => {
  const { deployer, keeper } = await hre.getNamedAccounts()
  const factory = await ethers.getContract<SpaceFactory>('SpaceFactory')
  const appIndex = await factory.appIndex()

  {
    if (appIndex === 0n) {
      const tx = await factory.createApp('Genesis App', deployer, precision.token(0, 16))
      await tx.wait()
    }
  }
}

func.id = 'Init'
func.tags = ['Init']
func.dependencies = ['SpaceFactory']
export default func
