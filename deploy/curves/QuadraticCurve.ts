import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'QuadraticCurve',
  dependencyNames: [],
}

export default createDeployFunction(options)
