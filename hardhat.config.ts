/* eslint-disable turbo/no-undeclared-env-vars */
import 'tsconfig-paths/register'
import { resolve } from 'path'
import { HardhatUserConfig } from 'hardhat/config'
import { config as dotenvConfig } from 'dotenv'
import '@nomicfoundation/hardhat-chai-matchers'
import '@nomicfoundation/hardhat-toolbox'
import '@nomicfoundation/hardhat-ethers'
import 'hardhat-deploy'
import 'hardhat-gas-reporter'
import 'hardhat-deploy-ethers'
import 'solidity-coverage'
import '@typechain/hardhat'

const dotenvConfigPath: string = './.env'
dotenvConfig({ path: resolve(__dirname, dotenvConfigPath) })

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  namedAccounts: {
    deployer: 0,
    config: {
      default: 1,
      sepolia: '0x5B7342B3b138bea7F6a2d157718acCc90BeF8f9D',
    },
  },

  gasReporter: {
    currency: 'USD',
    enabled: true,
    L1: 'ethereum',
    L2: 'base',
    // gasPrice: 80000,
  },

  networks: {
    hardhat: {
      saveDeployments: true,
      allowUnlimitedContractSize: true,
      chainId: 31337,
    },
    localhost: {
      saveDeployments: false,
    },
    sepolia: {
      url: 'https://eth-sepolia.g.alchemy.com/v2/3NOJzJclAc6EPYa2uW4rBchMV5o6eAI0',
      blockGasLimit: 100000000,
    },

    arb_sepolia: {
      url: `https://arb-sepolia.g.alchemy.com/v2/3NOJzJclAc6EPYa2uW4rBchMV5o6eAI0`,
      // url: 'https://sepolia-rollup.arbitrum.io/rpc',
      // chainId: 421_614,
      accounts: [process.env.ACCOUNT_PRIVATE_KEY!],
    },
    base_sepolia: {
      url: `https://base-sepolia.g.alchemy.com/v2/${process.env.SEPOLIA_API_KEY}`,
      accounts: [process.env.ACCOUNT_PRIVATE_KEY!],
    },

    base: {
      url: `https://base-mainnet.g.alchemy.com/v2/${process.env.SEPOLIA_API_KEY}`,
      accounts: [process.env.ACCOUNT_PRIVATE_KEY!],
    },
  },

  solidity: {
    compilers: [
      {
        version: '0.8.20',
        settings: {
          optimizer: {
            enabled: true,
            runs: 800,
          },
          viaIR: process.env.ENV === 'TEST' ? false : true,
        },
      },
    ],
  },

  paths: {
    artifacts: './artifacts',
    cache: './cache',
    sources: './contracts',
    tests: './test',
  },

  typechain: {
    outDir: 'types',
    target: 'ethers-v6',
  },

  mocha: {
    timeout: 1000000,
  },
}

export default config
