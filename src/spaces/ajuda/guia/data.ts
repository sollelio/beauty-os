// Interactive Guide «Como registar um serviço» (learning experience L4b) · synthetic data only: example people, services
// and payment methods, the same for every salon (Guide V4). Prices are whole-unit examples chosen per currency — never
// a conversion and never the salon's prices; the guide is offered only in a currency that has its own examples. The
// currency and timezone are the organization's settings, read from the device context already in memory.
import { useContext } from 'react'
import { OrganizationContext } from '../../../modules/org/OrganizationContext'
import type { CatalogueService } from '../../../modules/catalogue/api'
import type { CapturePerson, PaymentMethod } from '../../../modules/services/api'
import type { FlowFormat } from '../../servicos/RecordServiceViews'

export const PEOPLE: CapturePerson[] = [
  { id: 'guia-p1', display_name: 'Joana', capabilities: ['Cabelo', 'Unhas'] },
  { id: 'guia-p2', display_name: 'Miguel', capabilities: ['Barbearia'] },
  { id: 'guia-p3', display_name: 'Rita', capabilities: ['Unhas', 'Beleza'] },
  { id: 'guia-p4', display_name: 'Tomás', capabilities: ['Cabelo'] },
]

/** Exactly two methods, so «Misto» is offered as in a salon that uses two (shared/payment.ts mixedPair). */
export const METHODS: PaymentMethod[] = [
  { id: 'guia-m1', code: 'guia-numerario', label: 'Numerário' },
  { id: 'guia-m2', code: 'guia-transferencia', label: 'Transferência' },
]

const NAMES = { s1: 'Corte', s2: 'Brushing', s3: 'Coloração', s4: 'Manicure', s5: 'Manicure em gel', s6: 'Barba', s7: 'Pedicure' } as const
type ServiceKey = keyof typeof NAMES
const FREQUENT_KEYS: ServiceKey[] = ['s1', 's2', 's3', 's4', 's5']
const CATALOGUE_KEYS: ServiceKey[] = ['s1', 's2', 's3', 's4', 's5', 's6', 's7']

/** Example prices in whole units, per ISO currency code (organization setting `currency_code`). */
const PRICES: Record<string, Record<ServiceKey, number>> = {
  AOA: { s1: 3500, s2: 4000, s3: 9000, s4: 3000, s5: 6000, s6: 2000, s7: 3000 },
  EUR: { s1: 15, s2: 18, s3: 45, s4: 12, s5: 25, s6: 10, s7: 15 },
}

/** The highlighted examples of the approved sequence: Joana → Corte → Editar → Transferência → Confirmar serviço. */
export const TARGET_PERSON = PEOPLE[0]!
export const TARGET_METHOD = METHODS[1]!

export type GuideData = { format: FlowFormat; frequent: CatalogueService[]; catalogue: CatalogueService[] }

/** The guide's data in this organization's currency, or null when the currency has no example prices yet. */
export function useGuideData(): GuideData | null {
  const org = useContext(OrganizationContext)
  const prices = org ? PRICES[org.currency_code] : undefined
  if (!org || !prices) return null
  const service = (k: ServiceKey): CatalogueService => ({ id: `guia-${k}`, name: NAMES[k], default_price_minor: prices[k] * 10 ** org.currency_exponent })
  return {
    format: { currency_exponent: org.currency_exponent, currency_symbol: org.currency_symbol, timezone: org.timezone },
    frequent: FREQUENT_KEYS.map(service),
    catalogue: CATALOGUE_KEYS.map(service),
  }
}
