import { describe, expect, it } from 'vitest'
import { costInsights, serviceInsights, teamConcentration, buildInsights } from './insights'
import { INSIGHT_THRESHOLDS } from './thresholds'
import type { BusinessCosts, BusinessHealth, BusinessServices, BusinessTeam, Change, MetricKey, PeriodMetrics } from './types'

const money = (m: number) => `${m / 100} Kz`
const ref = (id: string, state: PeriodMetrics['period']['state'] = 'fechado') => ({ id, label: id.toUpperCase(), state, starts_on: '2025-01-01', ends_on: '2025-01-07' })
const metrics = (o: Partial<PeriodMetrics> = {}): PeriodMetrics => ({
  period: { ...ref('cur', 'aberto'), days: 7, is_complete: true }, source: 'live', production_minor: 100_000_00, services_count: 20,
  team_earnings_minor: 40_000_00, expenses_minor: 10_000_00, purchases_salon_minor: 0, operating_costs_minor: 50_000_00,
  operating_result_minor: 50_000_00, retention_pct: 50, free_minor: 50_000_00, unpaid_team_minor: null, approved: false, pending_rules_count: 0, private_fields: [], ...o })
const KEYS: MetricKey[] = ['production_minor', 'operating_costs_minor', 'operating_result_minor', 'free_minor', 'team_earnings_minor', 'expenses_minor', 'purchases_salon_minor', 'services_count']
const changes = (o: Partial<Record<MetricKey, Change>>) => Object.fromEntries(KEYS.map((k) => [k, o[k] ?? { delta_minor: 0, percent: 0 }])) as Record<MetricKey, Change>

function health(o: { prod?: number | null; result?: number | null; services?: number; open?: BusinessHealth['open_periods']; cats?: BusinessHealth['expense_categories']; avg?: boolean } = {}): BusinessHealth {
  const prev = o.prod === undefined
  return {
    current: metrics({ services_count: o.services ?? 20 }),
    previous: prev ? null : metrics({ period: { ...ref('prev'), days: 7, is_complete: true } }),
    average_3: o.avg ? { ...Object.fromEntries(KEYS.map((k) => [k, 0])) as Record<MetricKey, number>, periods: [ref('p1'), ref('p2'), ref('p3')], private_fields: [] } : null,
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
    const open = [{ id: 'a', label: 'A', state: 'em_pagamento' as const, is_complete: true, unpaid_team_minor: 120_000_00, unpaid_private: false, pending_rules_count: 0 },
                  { id: 'b', label: 'B', state: 'pronto_para_pagamento' as const, is_complete: true, unpaid_team_minor: 5_000_00, unpaid_private: false, pending_rules_count: 0 },
                  { id: 'c', label: 'C', state: 'aberto' as const, is_complete: true, unpaid_team_minor: null, unpaid_private: false, pending_rules_count: 2 },
                  { id: 'd', label: 'D', state: 'aberto' as const, is_complete: false, unpaid_team_minor: null, unpaid_private: false, pending_rules_count: 1 }]
    const r = buildInsights(health({ open }), money).insights
    expect(r.map((i) => i.kind)).toEqual(['payments_pending', 'period_blocked'])
    expect(r[0]!.title).toBe('Ainda faltam 125000 Kz por pagar à equipa.')
    expect(r[1]!.title).toBe('C terminou e não pode ser aprovado: 2 regras de remuneração por definir.')   // D is still running
    expect(kinds(health({ open: open.map((p) => ({ ...p, unpaid_team_minor: p.unpaid_team_minor ? 0 : null, pending_rules_count: 0 })) }))).toEqual([])
  })

  it('priority: action first, then attention; never more than 5', () => {
    const h = health({ prod: 20, result: -10, avg: true, cats: [cat(10_000_00, 5_000_00, 3)],
      open: [{ id: 'a', label: 'A', state: 'aberto', is_complete: true, unpaid_team_minor: 1, unpaid_private: false, pending_rules_count: 1 }] })
    expect(kinds(h)).toEqual(['payments_pending', 'period_blocked', 'production_up_result_down', 'expense_category_high'])
    expect(buildInsights(h, money, { ...INSIGHT_THRESHOLDS, maxShown: 2 }).insights).toHaveLength(2)
    expect(INSIGHT_THRESHOLDS.maxShown).toBe(5)
  })
})

describe('team concentration (insight 6)', () => {
  // as the read model gives them: unnamed, whole percent
  const share = (p: number[], n: number) => Math.round(([...p].sort((a, b) => b - a).slice(0, n).reduce((a, b) => a + b, 0) * 100) / p.reduce((a, b) => a + b, 0))
  const team = (prods: number[]): BusinessTeam => ({
    period: { id: 'p', label: 'P', state: 'fechado', starts_on: '2025-01-01', ends_on: '2025-01-07', is_complete: true },
    summary: { production_minor: prods.reduce((a, b) => a + b, 0), services_count: prods.length, average_ticket_minor: null, active_count: prods.length,
               top_share_pct: share(prods, 1), top_two_share_pct: share(prods, 2) },
    comparison: { available: false, reason: 'no_previous_period', period: null },
    people: prods.map((v, i) => ({ person_id: `x${i}`, display_name: `X${i}`, services_count: 1, production_minor: v, average_ticket_minor: v,
                                   share_pct: null, previous_production_minor: null, change: null })),
  })
  it('fires at 40% for one, or 65% for two (whole percent), with at least 3 professionals', () => {
    expect(teamConcentration(team([40, 30, 30])).insight?.title).toBe('40% da produção está concentrada num profissional.')
    expect(teamConcentration(team([39, 26, 20, 15])).insight?.title).toBe('65% da produção está concentrada em dois profissionais.')
    expect(teamConcentration(team([39, 25.4, 20.6, 15]))).toEqual({})                   // 39% · 64%
    expect(teamConcentration(team([80, 20])).skipped?.reason).toBe('not_enough_professionals')
  })
  it('the title names no one and is the same whoever holds the share', () => {
    const a = teamConcentration(team([50, 25, 25])).insight!, b = teamConcentration(team([25, 50, 25])).insight!
    expect(a.title).toBe(b.title)
    expect(JSON.stringify(a)).not.toMatch(/X0|X1|X2/)
  })
})

describe('service insights (7–9)', () => {
  const money = (m: number) => `${m} Kz`
  const cmp = { available: true, reason: null, period: { id: 'x', label: 'X', state: 'fechado' as const } }
  const sv = (o: { top?: number; topTwo?: number; distinct?: number; counts?: [number, number, number][] } = {}): BusinessServices => ({
    period: { id: 'p', label: 'P', state: 'fechado', starts_on: '2025-01-01', ends_on: '2025-01-07', is_complete: true },
    summary: { production_minor: 100, services_count: 10, average_ticket_minor: 10, distinct_services: o.distinct ?? 6, top_share_pct: o.top ?? 20, top_two_share_pct: o.topTwo ?? 40 },
    comparison: { previous: cmp, before_previous: cmp },
    services: (o.counts ?? []).map(([c2, c1, c0], i) => ({ service_id: `s${i}`, name: `S${i}`, count: c0, revenue_minor: c0, average_ticket_minor: 1, share_pct: null,
      previous: { count: c1, revenue_minor: c1 }, before_previous: { count: c2, revenue_minor: c2 }, change: null })),
    other: null,
  })
  const kinds = (s: BusinessServices) => serviceInsights(s, money).insights.map((i) => i.kind)
  it('concentration at exactly 35% or 55%, with at least 5 services performed', () => {
    expect(kinds(sv({ top: 35 }))).toEqual(['service_concentration'])
    expect(kinds(sv({ top: 34, topTwo: 55 }))).toEqual(['service_concentration'])
    expect(kinds(sv({ top: 34, topTwo: 54 }))).toEqual([])
    expect(serviceInsights(sv({ top: 50, distinct: 4 }), money).skipped).toContainEqual({ kind: 'service_concentration', reason: 'not_enough_services_performed' })
  })
  it('a trend needs two moves the same way, ≥ 20% in all, from a base of at least 5', () => {
    expect(kinds(sv({ counts: [[5, 6, 6]] }))).toEqual([])                 // 20% but the second move is flat
    expect(kinds(sv({ counts: [[10, 11, 12]] }))).toEqual(['service_growth'])
    expect(kinds(sv({ counts: [[11, 12, 13]] }))).toEqual([])               // +18%
    expect(kinds(sv({ counts: [[4, 3, 1]] }))).toEqual([])                  // base below 5
    expect(kinds(sv({ counts: [[10, 9, 8], [5, 4, 3]] }))).toEqual(['service_decline'])
    expect(serviceInsights(sv({ counts: [[10, 9, 8], [5, 4, 3]] }), money).insights[0]!.title).toBe('2 serviços caíram pelo segundo período consecutivo.')
  })
})

describe('cost and stock insights (10–11)', () => {
  const cmp = { available: true, reason: null, period: { id: 'prev', label: 'PREV', state: 'fechado' as const } }
  const costs = (o: { up?: number | null; pctProd?: number; activity?: [number, number][] } = {}): BusinessCosts => ({
    period: { id: 'cur', label: 'CUR', state: 'fechado', starts_on: '2025-01-01', ends_on: '2025-01-07', is_complete: true },
    comparison: { previous: cmp, average_3: { available: false, reason: 'insufficient_history', window: 3 } },
    summary: { production_minor: 100_000_00, expenses_minor: 0, purchases_salon_minor: 10_000_00, expenses_pct_of_production: 0,
               purchases_pct_of_production: o.pctProd ?? 10, products_attention: 0 },
    expenses: [],
    purchases: { salon_minor: 10_000_00, previous_salon_minor: 8_000_00, change: { delta_minor: 2_000_00, percent: o.up === undefined ? 25 : o.up }, products: [] },
    stock: { baixo: 0, comprar: 0, on_list: 0, urgent: 0, attention: [], window: { days: 30, from: '2024-12-09', to: '2025-01-07' },
             activity: (o.activity ?? []).map(([p, m], i) => ({ product_id: `p${i}`, name: `P${i}`, purchases: p, marks: m, last_purchased_at: null })) },
  })
  const k = (c: BusinessCosts) => costInsights(c, money).insights.map((i) => i.kind)
  it('purchases up at exactly 25% and 5% of production; not from a zero reference', () => {
    expect(k(costs())).toEqual(['purchases_up'])
    expect(k(costs({ up: 24.9 }))).toEqual([])
    expect(k(costs({ pctProd: 4.9 }))).toEqual([])
    expect(k(costs({ up: null }))).toEqual([])
  })
  it('product attention at 3 purchases or 3 marks; both in one sentence; below, nothing', () => {
    expect(k(costs({ up: 0, activity: [[2, 2]] }))).toEqual([])
    expect(costInsights(costs({ up: 0, activity: [[3, 0]] }), money).insights[0]!.title).toBe('P0 merece atenção: 3 compras nos últimos 30 dias.')
    expect(costInsights(costs({ up: 0, activity: [[4, 3]] }), money).insights[0]!.title)
      .toBe('P0 merece atenção: 4 compras e 3 marcações como baixo ou para comprar nos últimos 30 dias.')
  })
  it('on the overview, "purchases up" is dropped when "result down" already leads with purchases', () => {
    const h = health({ prod: 20, result: -10 })
    h.changes.previous!.purchases_salon_minor = { delta_minor: 9_000_00, percent: 900 }
    const ks = buildInsights(h, money, INSIGHT_THRESHOLDS, undefined, undefined, { ...costs(), period: { ...costs().period, id: 'cur' } }).insights.map((i) => i.kind)
    expect(ks).toContain('production_up_result_down')
    expect(ks).not.toContain('purchases_up')
  })
})
