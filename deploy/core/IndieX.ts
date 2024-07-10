import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'
import { precision } from '@utils/precision'

export const options: DeployFunctionOptions = {
  contractName: 'IndieX',
  dependencyNames: [],
  getDeployArgs({ dependencyContracts, namedAccounts }) {
    return [namedAccounts.deployer]
  },
}

export default createDeployFunction(options)
