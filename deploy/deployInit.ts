import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { precision } from '@utils/precision'
import { BlankFarmer, IndieX, QuadraticCurve } from 'types'

const func: DeployFunction = async (hre) => {
  const { deployer, keeper } = await hre.getNamedAccounts()

  const factory = await ethers.getContract<IndieX>('IndieX')
  const quadraticCurve = await ethers.getContract<QuadraticCurve>('QuadraticCurve')

  const appIndex = await factory.appIndex()

  {
    if (appIndex === 0n) {
      const tx = await factory.newApp({
        name: 'Genesis App',
        uri: '',
        feeTo: deployer,
        appFeePercent: 0n,
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
    const tx = await factory.addCurve(await quadraticCurve.getAddress())
    await tx.wait()
  }
}

func.id = 'Init'
func.tags = ['Init']
func.dependencies = ['IndieX', 'QuadraticCurve', 'BlankFarmer']
export default func
