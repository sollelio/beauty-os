// Client-side UX check for payment entry (Slices 01 and 03). The commands re-validate everything.
import type { PaymentMethod, PaymentPart } from '../modules/services/api'
import { formatMoney, type CurrencySettings } from './money'

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

// Payment method choice for the capture flows (Slices 01–03). The methods are the organization's own active ones
// (codes and labels are tenant data); nothing assumes a code. Misto splits the value between two methods — offered only
// when the organization has exactly two active methods (the pilot model, 03 §2 #4).
export const MIXED = 'mixed'
/** A payment method id, MIXED, or null (= the organization's first method, once loaded). */
export type PaymentChoice = string | null

export const mixedPair = (methods: readonly PaymentMethod[]): [PaymentMethod, PaymentMethod] | null =>
  methods.length === 2 ? [methods[0]!, methods[1]!] : null

/** The effective choice: what was picked if it is still offered, else the first method. */
export function effectiveChoice(choice: PaymentChoice, methods: readonly PaymentMethod[]): string | null {
  if (choice === MIXED) return mixedPair(methods) ? MIXED : (methods[0]?.id ?? null)
  if (choice && methods.some((m) => m.id === choice)) return choice
  return methods[0]?.id ?? null
}

export const choiceLabel = (choice: string | null, methods: readonly PaymentMethod[]) =>
  choice === MIXED ? 'Misto' : methods.find((m) => m.id === choice)?.label ?? ''

/** The command's payment parts (method ids + amounts), or null when the choice cannot be paid with these methods. */
export function paymentParts(choice: string | null, methods: readonly PaymentMethod[], valueMinor: number | null,
  mixedMinor: [number | null, number | null]): PaymentPart[] | null {
  if (choice === MIXED) {
    const pair = mixedPair(methods)
    return pair ? [{ method_id: pair[0].id, amount_minor: mixedMinor[0] ?? 0 }, { method_id: pair[1].id, amount_minor: mixedMinor[1] ?? 0 }] : null
  }
  if (!choice || valueMinor === null || !methods.some((m) => m.id === choice)) return null
  return [{ method_id: choice, amount_minor: valueMinor }]
}
