import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { ZeroAddress } from 'ethers'

describe.only('CreationFactory', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  describe('create', function () {
    it('create', async () => {
      const tx1 = await f.factory.connect(f.user0).create('Launcher', precision.token(0), 0, 0)
      await tx1.wait()

      const creation = await f.factory.getUserLatestCreation(f.user0.address)
      console.log('======creation:', creation)

      const price = await f.factory.getBuyPrice(creation.id, precision.token(1))

      console.log('=====res:', price, precision.toTokenDecimal(price))

      const tx2 = await f.factory.buy(creation.id, precision.token(1), {
        value: price,
      })

      // console.log('======price:', precision.toTokenDecimal(res[0]))
    })
  })
})
