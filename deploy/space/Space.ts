import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'Space',
  dependencyNames: ['IndieX'],
  getDeployArgs({ dependencyContracts, namedAccounts }) {
    return [namedAccounts.deployer]
  },
}

export default createDeployFunction(options)
