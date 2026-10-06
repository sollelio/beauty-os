// Client-side UX check for Slice 01 payment entry. The record_service command re-validates everything.
import { formatMoney, type CurrencySettings } from '../../shared/money'

export type PaymentMode = 'single' | 'mixed'

export type PaymentCheck = { valid: boolean; sentence: string | null }

export function checkPayment(
  valueMinor: number | null, mode: PaymentMode, partsMinor: [number | null, number | null], c: CurrencySettings,
): PaymentCheck {
  if (valueMinor === null) return { valid: false, sentence: null }
  if (mode === 'single') return { valid: true, sentence: null }
  const [a, b] = partsMinor
  if (a === null || b === null || a <= 0 || b <= 0) {
    const sum = (a ?? 0) + (b ?? 0)
    return { valid: false, sentence: `Soma ${formatMoney(sum, c)}. Indique os dois valores.` }
  }
  const sum = a + b
  if (sum < valueMinor) return { valid: false, sentence: `Soma ${formatMoney(sum, c)}. Faltam ${formatMoney(valueMinor - sum, c)} para chegar aos ${formatMoney(valueMinor, c)}.` }
  if (sum > valueMinor) return { valid: false, sentence: `Soma ${formatMoney(sum, c)}. Excede o total em ${formatMoney(sum - valueMinor, c)}.` }
  return { valid: true, sentence: `Soma ${formatMoney(sum, c)}. Pronto para confirmar.` }
}
