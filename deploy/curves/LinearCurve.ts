import { DeployFunctionOptions, createDeployFunction } from '@utils/deploy'

export const options: DeployFunctionOptions = {
  contractName: 'LinearCurve',
  dependencyNames: [],
}

export default createDeployFunction(options)
