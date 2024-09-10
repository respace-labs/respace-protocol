import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { precision } from '@utils/precision'
import { SpaceFactory } from 'types'

const func: DeployFunction = async (hre) => {
  try {
    const { deployer, keeper } = await hre.getNamedAccounts()
    const factory = await ethers.getContract<SpaceFactory>('SpaceFactory')
    const factoryAddr = await factory.getAddress()
    const appIndex = await factory.appIndex()

    {
      if (appIndex === 0n) {
        const tx = await factory.createApp('Genesis App', factoryAddr, precision.token('0.03'))
        await tx.wait()
      }
    }
  } catch (error) {
    console.log('deploy init failed', error)
  }
}

func.id = 'Init'
func.tags = ['Init']
func.dependencies = ['SpaceFactory']
export default func
