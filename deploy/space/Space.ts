import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'Space',
  dependencyNames: [],
  libraryNames: ['Share', 'Staking'],
  getDeployArgs({ dependencyContracts, namedAccounts }) {
    return [namedAccounts.deployer, namedAccounts.deployer, 'Space', 'xSPACE']
  },
}

export default createDeployFunction(options)
