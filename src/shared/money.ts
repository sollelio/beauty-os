// Money is stored in minor units of the organization's currency (Architecture Definition D-6).
export type CurrencySettings = { currency_exponent: number; currency_symbol: string }

/** "3.500 Kz" — thousands with ".", decimals (only when present) with ",", as in the approved designs. */
export function formatMoney(minor: number, c: CurrencySettings): string {
  const scale = 10 ** c.currency_exponent
  const whole = Math.trunc(Math.abs(minor) / scale)
  const frac = Math.abs(minor) % scale
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const decimals = frac > 0 ? ',' + String(frac).padStart(c.currency_exponent, '0') : ''
  return `${minor < 0 ? '−' : ''}${grouped}${decimals} ${c.currency_symbol}`
}

/** Whole units typed by the operator (digits only, as Slice 01 designs) to minor units. */
export function wholeUnitsToMinor(digits: string, c: CurrencySettings): number | null {
  const clean = digits.replace(/\D/g, '')
  if (clean === '') return null
  return Number(clean) * 10 ** c.currency_exponent
}

export function minorToWholeUnits(minor: number, c: CurrencySettings): number {
  return Math.round(minor / 10 ** c.currency_exponent)
}
