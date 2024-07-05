import { expect } from 'chai'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { CreationERC20 } from 'types'
import { ethers } from 'hardhat'

describe.only('CreationFactory', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  describe('create', function () {
    it('create', async () => {
      const tx = await f.factory.connect(f.user0).create('Launcher', precision.token(0))
      await tx.wait()

      const creationIds = await f.factory.getUserCreations(f.user0.address)

      const creation = await f.factory.getUserCreationBySymbol(f.user0.address, 'Launcher')
      console.log('======creation:', creation.id)

      // const res = await f.factory.getBuyPriceAfterFee(
      //   creation.id,
      //   precision.token(1),
      //   '0x3DA10640459ed334F516402Ba2ce5120B46769Bd',
      // )
      // console.log('=====res:', res)

      // console.log('======price:', precision.toTokenDecimal(res[0]))
    })
  })
})
