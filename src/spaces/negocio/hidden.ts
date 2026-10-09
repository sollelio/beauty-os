// How the Negócio screens say a figure is hidden, and why (07 D9 · B11).
import type { PrivateField } from '../../modules/business/types'

export const HIDDEN = 'Não mostrado'
export const HIDDEN_WHY = 'Não mostrado: neste período, este valor permitiria calcular quanto uma pessoa da equipa ganha ou tem a receber.'
export const HIDDEN_WHY_CONTRIBUTION = 'Não mostrado: neste período, este valor permitiria calcular quanto uma pessoa contribuiu do seu dinheiro para as compras.'
/** Why the period's hidden figures are hidden (07 D9 · B11): pay, a personal purchase contribution, or both. */
export function hiddenWhy(fields: PrivateField[]) {
  const pay = fields.some((f) => f === 'team_earnings_minor' || f === 'unpaid_team_minor')
  const contribution = fields.includes('purchases_salon_minor')
  if (pay && contribution) return 'Não mostrado: neste período, estes valores permitiriam calcular quanto uma pessoa ganha, tem a receber ou contribuiu para as compras.'
  return contribution ? HIDDEN_WHY_CONTRIBUTION : HIDDEN_WHY
}
