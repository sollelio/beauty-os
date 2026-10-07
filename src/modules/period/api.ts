// Module `period` access layer: Fecho reads (private context, B4) and commands (one-shot verified, B5–B7).
// Every figure is computed by the database (ADR-0004); review-dependent commands send the reviewed revision
// (ADR-0005 R-3) and a command_id per intent (ADR-0006). All reads live under PRIVATE_ROOT (removed on exit).
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export type PeriodState = 'aberto' | 'pronto_para_pagamento' | 'em_pagamento' | 'fechado'
export const STATE_LABEL: Record<PeriodState, string> = {
  aberto: 'Aberto', pronto_para_pagamento: 'Pronto para pagamento', em_pagamento: 'Em pagamento', fechado: 'Fechado',
}
export const STATE_ORDER: PeriodState[] = ['aberto', 'pronto_para_pagamento', 'em_pagamento', 'fechado']

export type PersonFigures = {
  person_id: string; display_name: string; is_owner: boolean; capabilities: string[]
  production: { count: number; total_minor: number }
  rule: { kind: 'standing' | 'contextual' | 'none'; percent: number | null; salon_percent: number | null; decided: boolean; set_at: string | null; set_by: string | null }
  earned_minor: number | null
  advances: { count: number; total_minor: number }
  payments: { count: number; total_minor: number }
  contributions: { count: number; total_minor: number }
  difference_minor: number | null; remaining_minor: number | null; excess_minor: number | null; delivered_to_earned_minor: number | null
}
export type OwnersDecision = { kind: 'none' | 'amount'; amount_minor: number | null; decided_at: string; decided_by: string }
export type Position = {
  people: PersonFigures[]; pending: { person_id: string; display_name: string }[]
  production: { count: number; total_minor: number }
  team_earned_minor: number; excess_minor: number; payable_minor: number; delivered_to_earned_minor: number
  advances_minor: number; payments_minor: number
  expenses: { count: number; total_minor: number }
  purchases: { count: number; total_minor: number; contributions_minor: number; salon_minor: number }
  reserve_allocated_minor: number; reserve_used_minor: number
  sobra_minor: number; livre_minor: number | null
  owners_decision: OwnersDecision | null; distribution_minor: number | null; undistributed_minor: number | null
}
export type PaymentStatus = 'nada_a_pagar' | 'por_pagar' | 'parcial' | 'pago'
export type ApprovalLine = {
  person_id: string; display_name: string; rule_kind: string; percent: number
  earned_minor: number; advances_minor: number; excess_minor: number
  approved_minor: number; paid_minor: number; outstanding_minor: number; status: PaymentStatus
  last: { amount_minor: number; paid_at: string; method_label: string; confirmed_by: string } | null
}
export type Approval = {
  id: string; approved_at: string; approved_by: string; review_revision: number; total_minor: number
  cases: { person_id: string; display_name: string; earned_minor: number; advances_minor: number; excess_minor: number }[]
  lines: ApprovalLine[]; paid_minor: number; outstanding_minor: number; payments_count: number
}
export type FechoException =
  | { kind: 'rule_pending'; blocking: true; person: PersonFigures }
  | { kind: 'above_earned'; blocking: false; person: PersonFigures }
  | { kind: 'distribution_undecided'; blocking: false }
  | { kind: 'distribution_above_free'; blocking: false }
  | { kind: 'payment_pending'; blocking: false; line: ApprovalLine }
export type Fecho = {
  period: { id: string; label: string; state: PeriodState; starts_on: string; ends_on: string; is_current: boolean }
  review_revision: number; calculation_version: string; source: 'live' | 'close_statement'
  position: Position; approval: Approval | null; exceptions: FechoException[]
  readiness: { can_approve: boolean; can_annul: boolean; can_pay: boolean; can_close: boolean; unpaid_minor: number }
  closed: { closed_at: string; closed_by: string; calculation_version: string; review_revision: number } | null
  reopened: { at: string; by: string; reason: string; to_state: PeriodState } | null
  close_statements_count: number
}
export type FechoPeriod = { id: string; label: string; state: PeriodState; starts_on: string; ends_on: string }
export type MoneyReview = {
  expenses: { id: string; occurred_at: string; category: string; note: string | null; method: string | null; amount_minor: number; reserve_used_minor: number }[]
  purchases: { id: string; occurred_at: string; origin: string | null; line_count: number; total_minor: number; salon_minor: number;
               contributors: { name: string; amount_minor: number }[]; reserve_used_minor: number }[]
  reserve: { allocated_minor: number; used_minor: number; balance_minor: number;
             movements: { kind: 'allocation' | 'use'; occurred_at: string; amount_minor: number; note?: string | null; target?: string; confirmed_by: string }[] }
}
export type RulePreview = {
  person: PersonFigures; current: PersonFigures; base_minor: number
  after: { sobra_minor: number; livre_minor: number | null; pending: { person_id: string; display_name: string }[]
           distribution_minor: number | null; undistributed_minor: number | null; owners_decision: OwnersDecision | null }
  history: { percent: number; period_label: string; starts_on: string }[]
}
export type HistoryEntry = { kind: string; at: string; by: string; [k: string]: unknown }

const k = (p: string | null) => p ?? 'current'
export const fechoKeys = {
  all: ['private', 'fecho'] as const,
  periods: ['private', 'fecho', 'periods'] as const,
  period: (p: string | null) => ['private', 'fecho', 'period', k(p)] as const,
  money: (p: string | null) => ['private', 'fecho', 'money', k(p)] as const,
  history: (p: string | null) => ['private', 'fecho', 'history', k(p)] as const,
  rulePreview: (p: string, person: string, pct: number | null) => ['private', 'fecho', 'rule-preview', p, person, pct] as const,
  distribution: (p: string, kind: string, amount: number | null) => ['private', 'fecho', 'distribution', p, kind, amount] as const,
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args)
  if (error) throw toAppError(error)
  return data as T
}

export const getFecho = (period: string | null) => rpc<Fecho>('fecho_period', { p_period_id: period })
export const listFechoPeriods = () => rpc<FechoPeriod[]>('fecho_periods')
export const getMoneyReview = (period: string | null) => rpc<MoneyReview>('fecho_money', { p_period_id: period })
export const getFechoHistory = (period: string | null) => rpc<HistoryEntry[]>('fecho_history', { p_period_id: period })
export const getRulePreview = (period: string, person: string, percent: number | null) =>
  rpc<RulePreview>('fecho_rule_preview', { p_period_id: period, p_person_id: person, p_percent: percent })
export const getDistributionPreview = (period: string, kind: 'none' | 'amount', amount: number | null) =>
  rpc<{ livre_minor: number | null; distribution_minor: number; undistributed_minor: number | null }>('fecho_distribution_preview',
    { p_period_id: period, p_kind: kind, p_amount_minor: amount })

type R = { review_revision: number; replayed?: boolean } & Record<string, unknown>
export type DecideRuleInput = { periodId: string; personId: string; percent: number }
export const decidePeriodRule = (c: string, g: string, i: DecideRuleInput) =>
  rpc<R>('decide_period_rule', { p_command_id: c, p_grant_id: g, p_period_id: i.periodId, p_person_id: i.personId, p_percent: i.percent })
export type OwnersDecisionInput = { periodId: string; kind: 'none' | 'amount'; amountMinor: number | null }
export const recordOwnersDecision = (c: string, g: string, i: OwnersDecisionInput) =>
  rpc<R>('record_owners_decision', { p_command_id: c, p_grant_id: g, p_period_id: i.periodId, p_kind: i.kind, p_amount_minor: i.kind === 'amount' ? i.amountMinor : null })
export type AllocateInput = { periodId: string; amountMinor: number; note: string | null }
export const allocateReserve = (c: string, g: string, i: AllocateInput) =>
  rpc<R>('allocate_reserve', { p_command_id: c, p_grant_id: g, p_period_id: i.periodId, p_amount_minor: i.amountMinor, p_note: i.note })
export type UseReserveInput = { expenseId: string | null; purchaseId: string | null; amountMinor: number }
export const spendReserve = (c: string, g: string, i: UseReserveInput) =>
  rpc<R>('use_reserve', { p_command_id: c, p_grant_id: g, p_expense_id: i.expenseId, p_purchase_id: i.purchaseId, p_amount_minor: i.amountMinor })
export type ReviewedInput = { periodId: string; revision: number }
export const approvePeriod = (c: string, g: string, i: ReviewedInput) =>
  rpc<R & { total_minor: number }>('approve_period', { p_command_id: c, p_grant_id: g, p_period_id: i.periodId, p_review_revision: i.revision })
export const annulApproval = (c: string, g: string, i: ReviewedInput) =>
  rpc<R>('annul_approval', { p_command_id: c, p_grant_id: g, p_period_id: i.periodId, p_review_revision: i.revision })
export const closePeriod = (c: string, g: string, i: ReviewedInput) =>
  rpc<R>('close_period', { p_command_id: c, p_grant_id: g, p_period_id: i.periodId, p_review_revision: i.revision })
export type ReopenInput = ReviewedInput & { reason: string }
export const reopenPeriod = (c: string, g: string, i: ReopenInput) =>
  rpc<R & { state: PeriodState }>('reopen_period', { p_command_id: c, p_grant_id: g, p_period_id: i.periodId, p_review_revision: i.revision, p_reason: i.reason })
export type PaymentInput = { periodId: string; personId: string; amountMinor: number; methodId: string }
export const confirmPayment = (c: string, g: string, i: PaymentInput) =>
  rpc<R & { outstanding_minor: number; paid_at: string }>('confirm_payment',
    { p_command_id: c, p_grant_id: g, p_period_id: i.periodId, p_person_id: i.personId, p_amount_minor: i.amountMinor, p_payment_method_id: i.methodId })
