import { ethers, deployments } from 'hardhat'
import { BlankFarmer, IndieX, Space, SpaceFactory, USDC } from '../types'
import { precision } from './precision'

export type Fixture = Awaited<ReturnType<typeof deployFixture>>

export async function deployFixture() {
  await deployments.fixture()
  const accountList = await ethers.getSigners()
  const { deployer } = await ethers.getNamedSigners()

  const [
    wallet,
    user0,
    user1,
    user2,
    user3,
    user4,
    user5,
    user6,
    user7,
    user8,
    user9,
    signer0,
    signer1,
    signer2,
    signer3,
    signer4,
    signer5,
    signer6,
    signer7,
    signer8,
    signer9,
  ] = accountList

  const indieX = await ethers.getContract<IndieX>('IndieX')
  const usdc = await ethers.getContract<USDC>('USDC')
  const blankFarmer = await ethers.getContract<BlankFarmer>('BlankFarmer')
  const spaceFactory = await ethers.getContract<SpaceFactory>('SpaceFactory')

  const indieXAddress = await indieX.getAddress()
  const usdcAddress = await usdc.getAddress()
  const blankFarmerAddress = await blankFarmer.getAddress()
  const spaceFactoryAddress = await spaceFactory.getAddress()

  console.log('=========>>>>:', indieXAddress)

  await usdc.mint(user0, precision.token(1_000_000, 6))
  await usdc.mint(user1, precision.token(1_000_000, 6))
  await usdc.mint(user2, precision.token(1_000_000, 6))
  await usdc.mint(user3, precision.token(1_000_000, 6))
  await usdc.mint(user4, precision.token(1_000_000, 6))
  await usdc.mint(user5, precision.token(1_000_000, 6))

  const accounts = {
    deployer,

    wallet,
    user0,
    user1,
    user2,
    user3,
    user4,
    user5,
    user6,
    user7,
    user8,
    user9,
    signer0,
    signer1,
    signer2,
    signer3,
    signer4,
    signer5,
    signer6,
    signer7,
    signer8,
    signer9,
    signers: [signer0, signer1, signer2, signer3, signer4, signer5, signer6],
  }

  return {
    accounts,
    ...accounts,
    indieXAddress,
    blankFarmer,
    blankFarmerAddress,
    indieX,
    usdc,
    usdcAddress,
    spaceFactory,
    spaceFactoryAddress,
  }
}
