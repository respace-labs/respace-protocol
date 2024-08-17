import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'Token',
  dependencyNames: [],
  libraryNames: [],
}

export default createDeployFunction(options)
