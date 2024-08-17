import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'Member',
  dependencyNames: [],
  libraryNames: [],
}

export default createDeployFunction(options)
