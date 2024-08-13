import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'SpaceFactory',
  dependencyNames: ['IndieX'],
  libraryNames: ['Share', 'Staking'],
  getDeployArgs({ dependencyContracts, namedAccounts }) {
    return [namedAccounts.deployer, dependencyContracts.IndieX.address]
  },
}

export default createDeployFunction(options)
