import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'SpaceCreator',
  dependencyNames: [],
  libraryNames: ['Token', 'Share', 'Staking', 'Member'],
}

export default createDeployFunction(options)
