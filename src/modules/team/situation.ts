// Module `team` read model: a professional's situation per period (Slice 04). Every figure — earned, remaining,
// excess, the difference and the rule shares — is computed by the database (ADR-0004); this layer only reads.
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export type PeriodState = 'aberto' | 'pronto_para_pagamento' | 'em_pagamento' | 'fechado'
export type Period = { id: string; label: string; state: PeriodState; starts_on: string; ends_on: string }

export type Situation = {
  view: 'manager' | 'self'
  person: { id: string; display_name: string; capabilities: string[] }
  period: Period
  production: { count: number; total_minor: number }
  rule: { kind: 'none' } | { kind: 'standing' | 'contextual'; percent: number | null; salon_percent: number | null; set_at: string; set_by: string | null }
  earned_minor: number | null
  advances: { count: number; total_minor: number }
  payments: { count: number; total_minor: number; last: { paid_at: string; method_label: string; confirmed_by: string | null } | null }
  difference_minor: number | null
  remaining_minor: number | null
  excess_minor: number | null
  contributions: { count: number; total_minor: number }
}

export type HistoryKind = 'service' | 'advance' | 'payment' | 'contribution'
export type HistoryRow = {
  kind: HistoryKind; record_id: string; occurred_at: string; title: string; method_label: string | null; confirmed_by: string | null
  note: string | null; amount_minor: number
  purchase: { origin: string | null; line_count: number; total_minor: number; salon_minor: number } | null
}
export type History = { total_count: number; rows: HistoryRow[] }
export type PeriodSummary = Period & { payments_total_minor: number }
export type TeamPerson = { id: string; display_name: string; capabilities: string[] }

export const situationKeys = {
  team: ['private', 'team'] as const,
  situation: (person: string, period: string | null) => ['private', 'situation', person, period] as const,
  history: (person: string, period: string | null, kind: HistoryKind | null) => ['private', 'history', person, period, kind] as const,
  periods: (person: string) => ['private', 'periods', person] as const,
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args)
  if (error) throw toAppError(error)
  return data as T
}

export const getSituation = (personId: string, periodId: string | null) =>
  rpc<Situation>('team_situation', { p_person_id: personId, p_period_id: periodId })
export const getHistory = (personId: string, periodId: string | null, kind: HistoryKind | null) =>
  rpc<History>('team_history', { p_person_id: personId, p_period_id: periodId, p_kind: kind, p_limit: 50 })
export const listPeriods = (personId: string) => rpc<PeriodSummary[]>('team_periods', { p_person_id: personId })
export const listTeamPeople = () => rpc<TeamPerson[]>('team_people')
