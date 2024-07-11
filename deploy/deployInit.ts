import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { precision } from '@utils/precision'
import { BlankFarmer, IndieX, QuadraticCurve } from 'types'

const func: DeployFunction = async (hre) => {
  const { deployer, keeper } = await hre.getNamedAccounts()

  const factory = await ethers.getContract<IndieX>('IndieX')
  const quadraticCurve = await ethers.getContract<QuadraticCurve>('QuadraticCurve')

  {
    const tx = await factory.newApp({
      name: 'Genesis App',
      uri: '',
      feeTo: deployer,
      appFeePercent: 0n,
      creatorFeePercent: precision.token(5, 16),
    })
    await tx.wait()
  }

  const blankFramer = await ethers.getContract<BlankFarmer>('BlankFarmer')

  {
    const tx = await factory.addCurve(await quadraticCurve.getAddress())
    await tx.wait()
  }

  {
    const tx = await factory.addFarmer(await blankFramer.getAddress())
    await tx.wait()
  }
}

func.id = 'Init'
func.tags = ['Init']
func.dependencies = ['IndieX', 'QuadraticCurve', 'BlankFarmer']
export default func
