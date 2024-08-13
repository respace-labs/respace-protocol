import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'Staking',
  dependencyNames: [],
  libraryNames: [],
}

export default createDeployFunction(options)
