import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'
import { precision } from '@utils/precision'

export const options: DeployFunctionOptions = {
  contractName: 'Space',
  dependencyNames: [],
  libraryNames: ['Token', 'Share', 'Staking', 'Member', 'SpaceHelper'],
  getDeployArgs({ dependencyContracts, namedAccounts }) {
    return [0n, namedAccounts.deployer, namedAccounts.deployer, 'Space', 'xSPACE', '']
  },
  canDeploy(hre) {
    return ['localhost', 'hardhat'].includes(hre.network.name)
  },
}

export default createDeployFunction(options)
