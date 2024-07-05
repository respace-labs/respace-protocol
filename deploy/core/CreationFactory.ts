import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'
import { precision } from '@utils/precision'

export const options: DeployFunctionOptions = {
  contractName: 'CreationFactory',
  dependencyNames: [],
  getDeployArgs({ dependencyContracts, namedAccounts }) {
    return [namedAccounts.deployer, precision.token(1, 15), 100, precision.token(1, 17), 0]
  },
}

export default createDeployFunction(options)
