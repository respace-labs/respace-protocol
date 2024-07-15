import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'LogarithmicCurve',
  dependencyNames: [],
}

export default createDeployFunction(options)
