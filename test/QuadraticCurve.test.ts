import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'

function amount(v: any) {
  return v
}

describe('QuadraticCurve', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('getPrice', async () => {
    const arr = Array(10).fill(0)
    // const arr = Array(10).fill(0)

    let supply = 0

    let sum = 0

    for (const item of arr) {
      const price = await f.quadraticCurve.getPrice(supply, amount(1), [])
      sum += precision.toTokenDecimal(price)
      console.log('sum======:', supply, precision.toTokenDecimal(price))
      supply += 1
    }
  })
})
