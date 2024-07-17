import { Fixture, deployFixture } from '@utils/deployFixture'
import { precision } from '@utils/precision'
import { expect } from 'chai'

function amount(v: any) {
  return precision.token(v)
}

describe('LinearCurve', function () {
  let f: Fixture

  beforeEach(async () => {
    f = await deployFixture()
  })

  it('getPrice() with int', async () => {
    const price = f.linearCurve.getPrice
    const p1 = await price(amount(1), amount(1), [])
    const p2 = await price(amount(2), amount(1), [])
    const p3 = await price(amount(3), amount(1), [])
    const p4 = await price(amount(4), amount(1), [])

    console.log('p1>>>>:', p1, precision.toTokenDecimal(p1))
    console.log('p2>>>>:', p2, precision.toTokenDecimal(p2))
    console.log('p3>>>>:', p3, precision.toTokenDecimal(p3))
    console.log('p4>>>>:', p4, precision.toTokenDecimal(p4))

    const s1 = await price(amount(1), amount(1), [])
    const s2 = await price(amount(1), amount(2), [])
    const s3 = await price(amount(1), amount(3), [])
    const s4 = await price(amount(1), amount(4), [])

    expect(s1).to.equal(p1)
    expect(s2).to.equal(p1 + p2)
    expect(s3).to.equal(p1 + p2 + p3)
    expect(s4).to.equal(p1 + p2 + p3 + p4)
  })

  it('getPrice() with float', async () => {
    const price = f.linearCurve.getPrice
    const p1 = await price(precision.token(0), precision.token(2, 17), [])
    const p2 = await price(precision.token(2, 17), precision.token(2, 17), [])
    const p3 = await price(precision.token(4, 17), precision.token(2, 17), [])
    const p4 = await price(precision.token(6, 17), precision.token(2, 17), [])

    console.log('p1>>>>:', p1, precision.toTokenDecimal(p1))
    console.log('p2>>>>:', p2, precision.toTokenDecimal(p2))
    console.log('p3>>>>:', p3, precision.toTokenDecimal(p3))
    console.log('p4>>>>:', p4, precision.toTokenDecimal(p4))

    const s1 = await price(precision.token(0), precision.token(2, 17), [])
    const s2 = await price(precision.token(0), precision.token(4, 17), [])
    const s3 = await price(precision.token(0), precision.token(6, 17), [])
    const s4 = await price(precision.token(0), precision.token(8, 17), [])

    expect(s1).to.equal(p1)
    expect(s2).to.equal(p1 + p2)
    expect(s3).to.equal(p1 + p2 + p3)
    expect(s4).to.equal(p1 + p2 + p3 + p4)
  })
})
