import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'Curation',
  dependencyNames: [],
  libraryNames: [],
}

export default createDeployFunction(options)
