import { describe, expect, it } from 'vitest'
import { contributionState, payersText } from './contributions'

const kz = { currency_exponent: 2, currency_symbol: 'Kz' }

describe('contributionState', () => {
  it('makes the salon the automatic remainder', () => {
    const s = contributionState(2350000, null, [{ personId: 'n', name: 'Nádia', amountMinor: 850000 }], kz)
    expect(s).toMatchObject({ salonMinor: 1500000, salonAutomatic: true, valid: true, sentence: 'Pronto para confirmar.' })
  })
  it('allows a zero salon share when another person pays everything', () => {
    const s = contributionState(2350000, null, [{ personId: 'n', name: 'Nádia', amountMinor: 2350000 }], kz)
    expect(s.salonMinor).toBe(0)
    expect(s.valid).toBe(true)
  })
  it('never drops a person without an amount', () => {
    const s = contributionState(2350000, null, [{ personId: 'n', name: 'Nádia', amountMinor: null }], kz)
    expect(s.valid).toBe(false)
    expect(s.sentence).toBe('Indique quanto pagou Nádia ou remova a linha.')
  })
  it('explains a shortfall or an excess once the salon is edited', () => {
    expect(contributionState(2350000, 1000000, [{ personId: 'n', name: 'Nádia', amountMinor: 850000 }], kz).sentence)
      .toBe('Soma 18.500 Kz. Faltam 5.000 Kz para chegar ao total.')
    expect(contributionState(2350000, 2000000, [{ personId: 'n', name: 'Nádia', amountMinor: 850000 }], kz).sentence)
      .toBe('Excede o total em 5.000 Kz.')
  })
})

describe('payersText', () => {
  it('derives the recap from the saved rows', () => {
    expect(payersText(1500000, [{ display_name: 'Nádia' }])).toBe('Salão e Nádia')
    expect(payersText(2350000, [])).toBe('pago pelo salão')
    expect(payersText(0, [{ display_name: 'Nádia' }])).toBe('pago por Nádia')
    expect(payersText(0, [{ display_name: 'Ana' }, { display_name: 'Nádia' }])).toBe('Ana e Nádia')
  })
})
