import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'SpaceFactory',
  dependencyNames: ['IndieX', 'Space'],
  getDeployArgs({ dependencyContracts, namedAccounts }) {
    return [namedAccounts.deployer, dependencyContracts.IndieX.address]
  },
}

export default createDeployFunction(options)
