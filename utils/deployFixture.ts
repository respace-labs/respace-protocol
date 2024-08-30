import { ethers, deployments } from 'hardhat'
import { Space, SpaceFactory } from '../types'
import { precision } from './precision'

export type Fixture = Awaited<ReturnType<typeof deployFixture>>

export async function deployFixture() {
  await deployments.fixture()
  const accountList = await ethers.getSigners()
  const { deployer } = await ethers.getNamedSigners()

  const [
    wallet, // deployer
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
    user10,
    user11,
    user12,
    user13,
    user14,
    user15,
    user16,
    user17,
    user18,
  ] = accountList

  const spaceFactory = await ethers.getContract<SpaceFactory>('SpaceFactory')
  const spaceFactoryAddr = await spaceFactory.getAddress()

  const accounts = {
    deployer,
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
    user10,
    user11,
    user12,
    user13,
    user14,
    user15,
    user16,
    user17,
    user18,
  }

  return {
    accounts,
    ...accounts,
    spaceFactory,
    spaceFactoryAddr,
  }
}
