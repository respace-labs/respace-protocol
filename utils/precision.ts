import { div, times } from './math'

function isInt(v: any) {
  if (Number.isInteger(v)) return true
  return /^\d+$/.test(v.toString())
}

export enum Decimals {
  TOKEN = 18,
  RATE = 5,
  PRICE = 8,
  USD = 6,
}

export const precision = {
  token(value: number | string, decimal: number = Decimals.TOKEN) {
    if (isInt(value)) {
      return BigInt(powString(decimal)) * BigInt(value)
    }
    return BigInt(times(Math.pow(10, decimal), value).toString())
  },

  decimal(value: bigint, decimals: number = Decimals.TOKEN) {
    if (!value) return 0
    return div(value.toString(), Math.pow(10, decimals))
  },
}

function powString(x: number) {
  return 1 + '0'.repeat(x)
}
