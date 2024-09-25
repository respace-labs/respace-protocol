import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'SpaceHelper',
  dependencyNames: [],
  libraryNames: ['Token', 'Share', 'Staking', 'Member', 'Curation'],
}

export default createDeployFunction(options)
