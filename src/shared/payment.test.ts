import { describe, expect, it } from 'vitest'
import { checkPayment } from './payment'

const kz = { currency_exponent: 2, currency_symbol: 'Kz' }

describe('checkPayment', () => {
  it('accepts a single method for any value, including zero', () => {
    expect(checkPayment(350000, 'single', [null, null], kz).valid).toBe(true)
    expect(checkPayment(0, 'single', [null, null], kz).valid).toBe(true)
  })
  it('requires both mixed parts', () => {
    expect(checkPayment(1200000, 'mixed', [1100000, null], kz).valid).toBe(false)
  })
  it('explains a shortfall and an excess', () => {
    const short = checkPayment(1200000, 'mixed', [1000000, 100000], kz)
    expect(short.valid).toBe(false)
    expect(short.sentence).toBe('Soma 11.000 Kz. Faltam 1.000 Kz para chegar aos 12.000 Kz.')
    const over = checkPayment(1200000, 'mixed', [1000000, 300000], kz)
    expect(over.valid).toBe(false)
    expect(over.sentence).toBe('Soma 13.000 Kz. Excede o total em 1.000 Kz.')
  })
  it('accepts mixed parts that add up', () => {
    expect(checkPayment(1200000, 'mixed', [1000000, 200000], kz)).toEqual({ valid: true, sentence: 'Soma 12.000 Kz. Pronto para confirmar.' })
  })
})
