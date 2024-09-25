import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'Member',
  dependencyNames: [],
  libraryNames: ['Curation', 'Token'],
}

export default createDeployFunction(options)
