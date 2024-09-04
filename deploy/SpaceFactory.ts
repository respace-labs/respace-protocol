import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'SpaceFactory',
  dependencyNames: [],
  libraryNames: ['Token', 'Share', 'Staking', 'Member'],
  getDeployArgs({ dependencyContracts, namedAccounts }) {
    return [namedAccounts.deployer, namedAccounts.deployer]
  },
}

export default createDeployFunction(options)
