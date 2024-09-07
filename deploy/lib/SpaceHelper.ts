import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'SpaceHelper',
  dependencyNames: [],
  libraryNames: [],
}

export default createDeployFunction(options)
