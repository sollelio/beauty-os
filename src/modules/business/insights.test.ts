import { describe, expect, it } from 'vitest'
import { buildInsights } from './insights'
import { INSIGHT_THRESHOLDS } from './thresholds'
import type { BusinessHealth, Change, MetricKey, PeriodMetrics } from './types'

const money = (m: number) => `${m / 100} Kz`
const ref = (id: string, state: PeriodMetrics['period']['state'] = 'fechado') => ({ id, label: id.toUpperCase(), state, starts_on: '2025-01-01', ends_on: '2025-01-07' })
const metrics = (o: Partial<PeriodMetrics> = {}): PeriodMetrics => ({
  period: { ...ref('cur', 'aberto'), days: 7, is_complete: true }, source: 'live', production_minor: 100_000_00, services_count: 20,
  team_earnings_minor: 40_000_00, expenses_minor: 10_000_00, purchases_salon_minor: 0, operating_costs_minor: 50_000_00,
  operating_result_minor: 50_000_00, retention_pct: 50, free_minor: 50_000_00, unpaid_team_minor: null, approved: false, pending_rules_count: 0, ...o })
const KEYS: MetricKey[] = ['production_minor', 'operating_costs_minor', 'operating_result_minor', 'free_minor', 'team_earnings_minor', 'expenses_minor', 'purchases_salon_minor', 'services_count']
const changes = (o: Partial<Record<MetricKey, Change>>) => Object.fromEntries(KEYS.map((k) => [k, o[k] ?? { delta_minor: 0, percent: 0 }])) as Record<MetricKey, Change>

function health(o: { prod?: number | null; result?: number | null; services?: number; open?: BusinessHealth['open_periods']; cats?: BusinessHealth['expense_categories']; avg?: boolean } = {}): BusinessHealth {
  const prev = o.prod === undefined
  return {
    current: metrics({ services_count: o.services ?? 20 }),
    previous: prev ? null : metrics({ period: { ...ref('prev'), days: 7, is_complete: true } }),
    average_3: o.avg ? { ...Object.fromEntries(KEYS.map((k) => [k, 0])) as Record<MetricKey, number>, periods: [ref('p1'), ref('p2'), ref('p3')] } : null,
    changes: {
      previous: prev ? null : changes({ production_minor: { delta_minor: 1, percent: o.prod ?? null }, operating_result_minor: { delta_minor: -1, percent: o.result ?? null },
                                        expenses_minor: { delta_minor: 5_000_00, percent: 50 } }),
      average_3: o.avg ? changes({}) : null,
    },
    expense_categories: o.cats ?? [],
    meta: { period_state: 'aberto', is_complete: true, history_count: o.avg ? 3 : 1,
            comparison: { previous: { available: !prev, reason: prev ? 'no_previous_period' : null, period: prev ? null : { id: 'prev', label: 'PREV', state: 'fechado' } },
                          average_3: { available: !!o.avg, reason: o.avg ? null : 'insufficient_history', window: 3 } },
            baseline: 'previous', calculation_version: 'x' },
    open_periods: o.open ?? [], trend: [],
  }
}
const kinds = (h: BusinessHealth) => buildInsights(h, money).insights.map((i) => i.kind)
const cat = (current: number, avg: number | null, presence: number) => ({ category_id: 'c', label: 'Luz', current_minor: current, previous_minor: 0, average_3_minor: avg, reference_presence: presence })

describe('buildInsights thresholds', () => {
  it('production up / result down: needs ≥10% up and ≥5% down, and a previous period', () => {
    expect(kinds(health({ prod: 10, result: -5 }))).toEqual(['production_up_result_down'])
    expect(kinds(health({ prod: 9.9, result: -20 }))).toEqual([])
    expect(kinds(health({ prod: 30, result: -4.9 }))).toEqual([])
    expect(kinds(health({ prod: 30, result: null }))).toEqual([])           // reference result 0: no percentage, no insight
    expect(kinds(health())).toEqual([])
    const i = buildInsights(health({ prod: 12, result: -8 }), money).insights[0]!
    expect(i.title).toBe('A produção subiu 12% face a PREV, mas o resultado operacional desceu 8%.')
    expect(i.detail.confidence).toMatch(/não indica que tenham sido a causa/)
  })

  it('production decline: ≥15% down with at least 10 services', () => {
    expect(kinds(health({ prod: -15, result: 0, services: 10 }))).toEqual(['production_decline'])
    expect(kinds(health({ prod: -14.9, result: 0 }))).toEqual([])
    const r = buildInsights(health({ prod: -40, result: 0, services: 9 }), money)
    expect(r.insights).toEqual([])
    expect(r.skipped).toContainEqual({ kind: 'production_decline', reason: 'not_enough_services' })
  })

  it('expense category: 3-period average, presence ≥2, ≥25% above, excess ≥3% of production', () => {
    expect(kinds(health({ avg: true, cats: [cat(10_000_00, 5_000_00, 2)] }))).toEqual(['expense_category_high'])
    expect(kinds(health({ avg: true, cats: [cat(10_000_00, 5_000_00, 1)] }))).toEqual([])          // seen in 1 of 3
    expect(kinds(health({ avg: true, cats: [cat(6_240_00, 5_000_00, 3)] }))).toEqual([])           // 24,8% above
    expect(kinds(health({ avg: true, cats: [cat(3_900_00, 1_000_00, 3)] }))).toEqual([])           // excess 2.900 < 3.000
    expect(kinds(health({ avg: true, cats: [cat(4_000_00, 1_000_00, 3)] }))).toEqual(['expense_category_high'])
    expect(kinds(health({ cats: [cat(10_000_00, 5_000_00, 3)] }))).toEqual([])                    // no 3-period history
    const two = buildInsights(health({ avg: true, cats: [cat(10_000_00, 5_000_00, 3), { ...cat(9_000_00, 4_000_00, 3), category_id: 'd', label: 'Água' }] }), money)
    expect(two.insights).toHaveLength(1)                                                           // grouped
    expect(two.insights[0]!.title).toBe('2 categorias de despesa acima da média dos últimos 3 períodos.')
  })

  it('payments pending and blocked periods: grouped, and gone once resolved', () => {
    const open = [{ id: 'a', label: 'A', state: 'em_pagamento' as const, is_complete: true, unpaid_team_minor: 120_000_00, pending_rules_count: 0 },
                  { id: 'b', label: 'B', state: 'pronto_para_pagamento' as const, is_complete: true, unpaid_team_minor: 5_000_00, pending_rules_count: 0 },
                  { id: 'c', label: 'C', state: 'aberto' as const, is_complete: true, unpaid_team_minor: null, pending_rules_count: 2 },
                  { id: 'd', label: 'D', state: 'aberto' as const, is_complete: false, unpaid_team_minor: null, pending_rules_count: 1 }]
    const r = buildInsights(health({ open }), money).insights
    expect(r.map((i) => i.kind)).toEqual(['payments_pending', 'period_blocked'])
    expect(r[0]!.title).toBe('Ainda faltam 125000 Kz por pagar à equipa.')
    expect(r[1]!.title).toBe('C terminou e não pode ser aprovado: 2 regras de remuneração por definir.')   // D is still running
    expect(kinds(health({ open: open.map((p) => ({ ...p, unpaid_team_minor: p.unpaid_team_minor ? 0 : null, pending_rules_count: 0 })) }))).toEqual([])
  })

  it('priority: action first, then attention; never more than 5', () => {
    const h = health({ prod: 20, result: -10, avg: true, cats: [cat(10_000_00, 5_000_00, 3)],
      open: [{ id: 'a', label: 'A', state: 'aberto', is_complete: true, unpaid_team_minor: 1, pending_rules_count: 1 }] })
    expect(kinds(h)).toEqual(['payments_pending', 'period_blocked', 'production_up_result_down', 'expense_category_high'])
    expect(buildInsights(h, money, { ...INSIGHT_THRESHOLDS, maxShown: 2 }).insights).toHaveLength(2)
    expect(INSIGHT_THRESHOLDS.maxShown).toBe(5)
  })
})
