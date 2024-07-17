import { BigNumber } from 'bignumber.js'
import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'

function amount(v: any) {
  // return precision.token(v)
  return v
}

describe('LinearCurve', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it.only('f(x) = x', async () => {
    const curve = f.linearCurve.curve
    const c1 = await curve(amount(1), [1, 0])
    const c2 = await curve(amount(2), [1, 0])
    const c3 = await curve(amount(3), [1, 0])

    expect(c1).to.equal(1)
    expect(c2).to.equal(2)
    expect(c3).to.equal(3)

    const sum = f.linearCurve.sum
    expect(await sum(2, [1, 0])).to.equal(c1 + c2)
    expect(await sum(3, [1, 0])).to.equal(c1 + c2 + c3)

    const price = f.linearCurve.getPrice
    expect(await price(0, 1, [1, 0])).to.equal(1)
    expect(await price(1, 1, [1, 0])).to.equal(2)
    expect(await price(2, 1, [1, 0])).to.equal(3)

    expect(await price(1, 2, [1, 0])).to.equal(5)
  })

  it('f(x) = 2x + 1', async () => {
    const curve = f.linearCurve.curve
    const c1 = await curve(1, [2, 1])
    const c2 = await curve(2, [2, 1])
    const c3 = await curve(3, [2, 1])
    expect(c1).to.equal(3)
    expect(c2).to.equal(5)
    expect(c3).to.equal(7)

    const sum = f.linearCurve.sum
    expect(await sum(1, [1, 0])).to.equal(c1)
    expect(await sum(2, [1, 0])).to.equal(c1 + c2)
    expect(await sum(3, [1, 0])).to.equal(c1 + c2 + c3)
  })

  it('getPrice -> f(x) = x (1 ether/10000)', async () => {
    const getPrice = f.linearCurve.getPrice

    {
      const p = await getPrice(amount(0), amount(1), [1, 0])
      console.log('====p:', precision.toTokenDecimal(p))
    }

    {
      const p = await getPrice(amount(1), amount(1), [1, 0])
      console.log('====p:', p, precision.toTokenDecimal(p))
    }

    {
      const p = await getPrice(amount(2), amount(1), [1, 0])
      console.log('====p:', p, precision.toTokenDecimal(p))
    }
  })
})
