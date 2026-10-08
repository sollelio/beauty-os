// Module `business` access layer: Business Health (Negócio → Visão geral). One read boundary, business_health,
// enforced by the database (private session + business.health.read). It carries business-level figures only; a
// person's remuneration stays behind team.finance.read. All reads live under PRIVATE_ROOT (removed on exit).
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export type * from './types'
import type { BusinessHealth, PeriodRef } from './types'

const k = (p: string | null) => p ?? 'current'
export const businessKeys = {
  all: ['private', 'business'] as const,
  periods: ['private', 'business', 'periods'] as const,
  health: (p: string | null) => ['private', 'business', 'health', k(p)] as const,
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args)
  if (error) throw toAppError(error)
  return data as T
}

export const getBusinessHealth = (period: string | null) => rpc<BusinessHealth>('business_health', { p_period_id: period })
export const listBusinessPeriods = () => rpc<PeriodRef[]>('business_periods')
