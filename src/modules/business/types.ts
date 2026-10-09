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
  private_fields: PrivateField[]   // hidden: they would reveal one person's finance (07 D9 · B11); null above
}
export type PrivateField = 'team_earnings_minor' | 'operating_costs_minor' | 'operating_result_minor' | 'retention_pct' | 'free_minor' | 'unpaid_team_minor'
export type MetricKey = 'production_minor' | 'operating_costs_minor' | 'operating_result_minor' | 'free_minor'
  | 'team_earnings_minor' | 'expenses_minor' | 'purchases_salon_minor' | 'services_count'
export type Change = { delta_minor: number | null; percent: number | null }
/** Negócio → Equipa (business_team): operational figures per professional, never remuneration (07 D9 · Slice 02). */
export type TeamMember = {
  person_id: string; display_name: string; services_count: number; production_minor: number; average_ticket_minor: number
  share_pct: number | null; previous_production_minor: number | null; change: Change | null
}
/** Negócio → Serviços (business_services): per service, never per person (07 D9 · Slice 03). */
export type ServiceFigures = { count: number; revenue_minor: number }
export type ServiceRow = ServiceFigures & {
  service_id: string; name: string; average_ticket_minor: number; share_pct: number | null
  previous: ServiceFigures | null; before_previous: ServiceFigures | null   // null: no comparison, or not shown on its own then
  change: { count: Change; revenue: Change } | null
}
type ComparisonMeta = { available: boolean; reason: ComparisonReason | null; period: { id: string; label: string; state: PeriodState } | null }
export type BusinessServices = {
  period: PeriodRef & { is_complete: boolean }
  summary: { production_minor: number; services_count: number; average_ticket_minor: number | null; distinct_services: number
             top_share_pct: number | null; top_two_share_pct: number | null }   // unnamed, whole percent
  comparison: { previous: ComparisonMeta; before_previous: ComparisonMeta }
  services: ServiceRow[]
  other: { services: number; count: number; revenue_minor: number } | null   // services not shown on their own (B11)
}
export type BusinessTeam = {
  period: PeriodRef & { is_complete: boolean }
  summary: { production_minor: number; services_count: number; average_ticket_minor: number | null; active_count: number
             top_share_pct: number | null; top_two_share_pct: number | null }   // unnamed, whole percent
  comparison: { available: boolean; reason: ComparisonReason | null; period: { id: string; label: string; state: PeriodState } | null }
  people: TeamMember[] | null   // named rows only for team.finance.read (07 D9 · B11)
}
export type ComparisonReason = 'current_incomplete' | 'no_previous_period' | 'previous_not_closed' | 'previous_not_comparable' | 'insufficient_history'
export type BusinessHealth = {
  current: PeriodMetrics
  previous: PeriodMetrics | null
  average_3: (Record<MetricKey, number | null> & { periods: PeriodRef[]; private_fields: PrivateField[] }) | null
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
  open_periods: { id: string; label: string; state: PeriodState; is_complete: boolean; unpaid_team_minor: number | null; unpaid_private: boolean
                  pending_rules_count: number }[]
  trend: { id: string; label: string; is_complete: boolean; production_minor: number; operating_result_minor: number | null; result_private: boolean }[]
}
