import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'BlankFarmer',
  dependencyNames: ['IndieX'],
  getDeployArgs({ dependencyContracts }) {
    return [dependencyContracts.IndieX.address]
  },
}

export default createDeployFunction(options)
