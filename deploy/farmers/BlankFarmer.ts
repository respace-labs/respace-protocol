import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'BlankFarmer',
  dependencyNames: ['CreationFactory'],
  getDeployArgs({ dependencyContracts }) {
    return [dependencyContracts.CreationFactory.address]
  },
}

export default createDeployFunction(options)
