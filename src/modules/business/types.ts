// Business Health read-model types (business_health). No runtime imports: shared by the app, the domain layer and the DB tests.
type PeriodState = 'aberto' | 'pronto_para_pagamento' | 'em_pagamento' | 'fechado'   // the period module's union (kept import-free)

export type PeriodRef = { id: string; label: string; state: PeriodState; starts_on: string; ends_on: string }
export type PeriodMetrics = {
  period: PeriodRef & { days: number; is_complete: boolean }
  source: 'live' | 'close_statement'
  production_minor: number; services_count: number
  team_earnings_minor: number | null; expenses_minor: number; purchases_salon_minor: number
  operating_costs_minor: number | null; operating_result_minor: number | null; retention_pct: number | null
  free_minor: number | null; unpaid_team_minor: number | null; approved: boolean; pending_rules_count: number
}
export type MetricKey = 'production_minor' | 'operating_costs_minor' | 'operating_result_minor' | 'free_minor'
  | 'team_earnings_minor' | 'expenses_minor' | 'purchases_salon_minor' | 'services_count'
export type Change = { delta_minor: number | null; percent: number | null }
export type ComparisonReason = 'current_incomplete' | 'no_previous_period' | 'previous_not_closed' | 'previous_not_comparable' | 'insufficient_history'
export type BusinessHealth = {
  current: PeriodMetrics
  previous: PeriodMetrics | null
  average_3: (Record<MetricKey, number | null> & { periods: PeriodRef[] }) | null
  changes: { previous: Record<MetricKey, Change> | null; average_3: Record<MetricKey, Change> | null }
  expense_categories: { category_id: string; label: string; current_minor: number; previous_minor: number | null
                        average_3_minor: number | null; reference_presence: number | null }[]
  meta: {
    period_state: PeriodState; is_complete: boolean; history_count: number
    comparison: { previous: { available: boolean; reason: ComparisonReason | null; period: { id: string; label: string; state: PeriodState } | null }
                  average_3: { available: boolean; reason: ComparisonReason | null; window: number } }
    baseline: 'previous_and_average_3' | 'previous' | 'average_3' | 'none'
    calculation_version: string
  }
  open_periods: { id: string; label: string; state: PeriodState; is_complete: boolean; unpaid_team_minor: number | null; pending_rules_count: number }[]
  trend: { id: string; label: string; is_complete: boolean; production_minor: number; operating_result_minor: number | null }[]
}
