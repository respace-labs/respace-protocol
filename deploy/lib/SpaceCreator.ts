import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'SpaceCreator',
  dependencyNames: [],
  libraryNames: ['Token', 'Share', 'Staking', 'Member', 'Curation', 'SpaceHelper'],
}

export default createDeployFunction(options)
