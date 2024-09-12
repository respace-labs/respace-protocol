import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'SpaceCreator',
  dependencyNames: [],
  libraryNames: ['Token', 'Share', 'Staking', 'Member', 'SpaceHelper'],
}

export default createDeployFunction(options)
