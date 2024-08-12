import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'Token',
  dependencyNames: [],
  getDeployArgs({ dependencyContracts, namedAccounts }) {
    return [namedAccounts.deployer, 'xToken', 'XTOKEN']
  },
}

export default createDeployFunction(options)
