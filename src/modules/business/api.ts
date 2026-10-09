// Module `business` access layer: Business Health (Negócio → Visão geral, Equipa, Serviços). Reads business_health, business_team, business_services,
// enforced by the database (private session + business.health.read). It carries business-level figures only; a
// person's remuneration stays behind team.finance.read. All reads live under PRIVATE_ROOT (removed on exit).
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export type * from './types'
import type { BusinessHealth, BusinessServices, BusinessTeam, PeriodRef } from './types'

const k = (p: string | null) => p ?? 'current'
export const businessKeys = {
  all: ['private', 'business'] as const,
  periods: ['private', 'business', 'periods'] as const,
  health: (p: string | null) => ['private', 'business', 'health', k(p)] as const,
  team: (p: string | null) => ['private', 'business', 'team', k(p)] as const,
  services: (p: string | null) => ['private', 'business', 'services', k(p)] as const,
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args)
  if (error) throw toAppError(error)
  return data as T
}

export const getBusinessHealth = (period: string | null) => rpc<BusinessHealth>('business_health', { p_period_id: period })
export const getBusinessTeam = (period: string | null) => rpc<BusinessTeam>('business_team', { p_period_id: period })
export const getBusinessServices = (period: string | null) => rpc<BusinessServices>('business_services', { p_period_id: period })
export const listBusinessPeriods = () => rpc<PeriodRef[]>('business_periods')
