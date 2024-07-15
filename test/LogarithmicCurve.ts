import { BigNumber } from 'bignumber.js'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'

function amount(v: any) {
  // return precision.token(v)
  return v
}

describe('LogarithmicCurve', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('getPrice', async () => {
    const arr = Array(100).fill(0)
    // const arr = Array(10).fill(0)

    let supply = 0

    let sum = 0

    for (const item of arr) {
      const price = await f.logarithmicCurve.getPrice(supply, 1, [])
      console.log('=======price:', supply, precision.toTokenDecimal(price))

      sum += precision.toTokenDecimal(price)
      // console.log('sum======:', supply, sum, precision.toTokenDecimal(price))

      supply += 1
    }
  })
})
