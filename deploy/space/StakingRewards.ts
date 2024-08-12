import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'StakingRewards',
  dependencyNames: [],
  getDeployArgs({ dependencyContracts, namedAccounts }) {
    return [namedAccounts.deployer]
  },
}

export default createDeployFunction(options)
