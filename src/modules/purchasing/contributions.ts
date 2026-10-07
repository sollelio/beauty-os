// "Quem pagou?" (Slice 03 P3): the Salão row is the automatic remainder until edited; a zero salon share is valid;
// every added person must have an amount; the sum must equal the total. The command re-validates everything.
import { formatMoney, type CurrencySettings } from '../../shared/money'

export type ContributionRow = { personId: string; name: string; amountMinor: number | null }
export type ContributionState = {
  salonMinor: number; salonAutomatic: boolean; sumMinor: number; valid: boolean; sentence: string
}

export function contributionState(totalMinor: number, salonOverrideMinor: number | null, rows: ContributionRow[], c: CurrencySettings): ContributionState {
  const missing = rows.find((r) => r.amountMinor === null || r.amountMinor <= 0)
  const people = rows.reduce((s, r) => s + (r.amountMinor ?? 0), 0)
  const salonAutomatic = salonOverrideMinor === null
  const salonMinor = salonAutomatic ? Math.max(totalMinor - people, 0) : salonOverrideMinor
  const sumMinor = salonMinor + people
  if (missing) return { salonMinor, salonAutomatic, sumMinor, valid: false, sentence: `Indique quanto pagou ${missing.name} ou remova a linha.` }
  if (sumMinor < totalMinor) return { salonMinor, salonAutomatic, sumMinor, valid: false, sentence: `Soma ${formatMoney(sumMinor, c)}. Faltam ${formatMoney(totalMinor - sumMinor, c)} para chegar ao total.` }
  if (sumMinor > totalMinor) return { salonMinor, salonAutomatic, sumMinor, valid: false, sentence: `Excede o total em ${formatMoney(sumMinor - totalMinor, c)}.` }
  return { salonMinor, salonAutomatic, sumMinor, valid: true, sentence: 'Pronto para confirmar.' }
}

/** Success recap wording derived from the saved rows: "Salão e Nádia" / "pago pelo salão" / "pago por Nádia". */
export function payersText(salonMinor: number, contributors: { display_name: string }[]): string {
  const names = contributors.map((x) => x.display_name)
  if (salonMinor > 0 && names.length === 0) return 'pago pelo salão'
  if (salonMinor === 0 && names.length === 1) return `pago por ${names[0]}`
  const all = salonMinor > 0 ? ['Salão', ...names] : names
  return all.length <= 1 ? all.join('') : `${all.slice(0, -1).join(', ')} e ${all[all.length - 1]}`
}
