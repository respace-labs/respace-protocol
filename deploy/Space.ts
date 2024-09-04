import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'Space',
  dependencyNames: [],
  libraryNames: ['Token', 'Share', 'Staking', 'Member'],
  getDeployArgs({ dependencyContracts, namedAccounts }) {
    return [namedAccounts.deployer, namedAccounts.deployer, 'Space', 'xSPACE', 0n]
  },
  canDeploy(hre) {
    return ['localhost', 'hardhat'].includes(hre.network.name)
  },
}

export default createDeployFunction(options)
