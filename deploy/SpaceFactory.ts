import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'SpaceFactory',
  dependencyNames: [],
  libraryNames: ['SpaceHelper', 'SpaceCreator'],
  getDeployArgs({ namedAccounts }) {
    return [namedAccounts.deployer]
  },
}

export default createDeployFunction(options)
