import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'Space',
  dependencyNames: ['Token', 'StakingRewards'],
  getDeployArgs({ dependencyContracts, namedAccounts }) {
    return [namedAccounts.deployer]
  },
}

export default createDeployFunction(options)
