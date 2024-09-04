import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'CreationFactory',
  dependencyNames: [],
  libraryNames: [],
  getDeployArgs({ namedAccounts }) {
    return [namedAccounts.deployer]
  },
}

export default createDeployFunction(options)
