import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'Share',
  dependencyNames: [],
  libraryNames: [],
}

export default createDeployFunction(options)
