// Business Health Slice 05 — business_finance read model (supabase/migrations/20261010000700) and the finance insights
// built from business_health / business_costs (src/modules/business/insights.ts). Fixtures: "Teste Finanças F",
// supabase/seeds/16_business_finance.sql. One anonymous device for the whole file: the people switch by opening a new
// private session (it supersedes).
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { device } from './env'
import { buildInsights } from '../../src/modules/business/insights'
import type { BusinessCosts, BusinessFinance, BusinessHealth, FinanceMetric } from '../../src/modules/business/types'

const id = (s: string) => `00000000-0000-4000-8000-0000000077${s}`
const K = (kz: number) => kz * 100
const MANAGER = id('a5'), BUSINESS_ONLY = id('a6'), NO_PERMS = id('a7')
const PIN: Record<string, string> = { [MANAGER]: '717171', [BUSINESS_ONLY]: '727272', [NO_PERMS]: '737373' }
const A_OCT = '00000000-0000-4000-8000-0000000ca802'           // a period of test organization A
const money = (m: number) => `${m / 100} Kz`
type Row = Record<string, any>                                 // eslint-disable-line @typescript-eslint/no-explicit-any

let dev: SupabaseClient
const P: Record<string, string> = {}
async function as(person: string) {
  const r = await dev.rpc('verify_person', { p_person_id: person, p_secret: PIN[person], p_scope: 'private_session' })
  expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
}
async function finance(label: string): Promise<BusinessFinance> {
  const r = await dev.rpc('business_finance', { p_period_id: P[label] })
  expect(r.error, r.error?.message).toBeNull()
  return r.data
}
const metric = (f: BusinessFinance, key: FinanceMetric['key']) => f.metrics.find((m) => m.key === key)!
const err = async (fn: string, args: Row = {}) => (await dev.rpc(fn, args)).error?.message
const numbers = (v: unknown): number[] => typeof v === 'number' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(numbers) : []

beforeAll(async () => {
  dev = await device('TEST-ORG-F-2026')
  await as(MANAGER)
  for (const p of (await dev.rpc('business_periods')).data as Row[]) P[p.label] = p.id
})

describe('access', () => {
  it('requires a private session, then business.health.read; another organization\'s period is rejected', async () => {
    await dev.rpc('end_private_context')
    expect(await err('business_finance')).toBe('VERIFICATION_REQUIRED')
    await as(NO_PERMS)
    expect(await err('business_finance', { p_period_id: P['Semana F4'] })).toBe('NOT_AUTHORIZED')
    await as(BUSINESS_ONLY)                                       // no team.finance.read needed for the safe aggregates
    expect(await err('business_finance', { p_period_id: P['Semana F4'] })).toBeUndefined()
    expect(await err('business_finance', { p_period_id: A_OCT })).toBe('CROSS_TENANT_REFERENCE')
  })
})

describe('figures (team.finance.read viewer: the complete aggregate context)', () => {
  beforeAll(async () => { await as(MANAGER) })

  it('production, costs and result are the Fecho position; cancelled records excluded', async () => {
    const f = await finance('Semana F5')
    const fecho = (await dev.rpc('fecho_period', { p_period_id: P['Semana F5'] })).data as Row
    const pos = fecho.position
    expect(metric(f, 'production_minor').current).toBe(pos.production.total_minor)
    expect(metric(f, 'team_earnings_minor').current).toBe(pos.team_earned_minor)
    expect(metric(f, 'expenses_minor').current).toBe(pos.expenses.total_minor)
    expect(metric(f, 'purchases_salon_minor').current).toBe(pos.purchases.salon_minor)
    expect(metric(f, 'free_minor').current).toBe(pos.livre_minor)
    expect(f.obligations).toMatchObject({ state: 'em_pagamento', approved: true, paid_team_minor: fecho.approval.paid_minor,
                                          unpaid_team_minor: fecho.approval.outstanding_minor, owners_decision: null, undistributed_minor: null })
    expect(f.obligations).toMatchObject({ paid_team_minor: K(50000), unpaid_team_minor: K(30000) })
    expect(metric(f, 'operating_result_minor').current).toBe(K(80000))
    const f4 = await finance('Semana F4')                         // a cancelled service (30.000) and expense (50.000)
    expect(metric(f4, 'production_minor').current).toBe(K(220000))
    expect(metric(f4, 'expenses_minor').current).toBe(K(48000))
    expect(f4.private_fields).toEqual([])
  })

  it('a closed period reads its close statement: a later rule change does not move it', async () => {
    const f1 = await finance('Semana F1')
    expect(f1.source).toBe('close_statement')
    expect(metric(f1, 'team_earnings_minor').current).toBe(K(83000))   // live (C at 90%) would be 89.000
    expect(metric(f1, 'operating_result_minor').current).toBe(K(77000))
    expect(f1.obligations).toMatchObject({ paid_team_minor: K(83000), unpaid_team_minor: 0, undistributed_minor: K(27000), owners_decision: 'amount' })
  })

  it('decomposition, indicators and reserve', async () => {
    const f = await finance('Semana F4')
    const v = (k: FinanceMetric['key']) => metric(f, k).current!
    expect(v('production_minor') - v('team_earnings_minor') - v('expenses_minor') - v('purchases_salon_minor')).toBe(v('operating_result_minor'))
    expect(v('operating_costs_minor')).toBe(K(159000))
    expect(f.indicators).toMatchObject({ operating_cost_ratio_pct: 72.3, retention_pct: 27.7, retention_previous_pct: 34.5,
                                         retention_change_previous_pp: -6.8, retention_average_3_pct: 34.8, retention_change_average_3_pp: -7.1 })
    expect(f.reserve).toEqual({ balance_minor: K(35000), allocated_minor: K(10000), used_minor: 0, previous_allocated_minor: 0, previous_used_minor: K(5000) })
    const money = (await dev.rpc('fecho_money', { p_period_id: P['Semana F4'] })).data as Row
    expect(f.reserve.balance_minor).toBe(money.reserve.balance_minor)
    expect(f.obligations).toMatchObject({ state: 'fechado', free_minor: K(51000), undistributed_minor: K(21000), owners_decision: 'amount' })
    expect((await finance('Semana F2')).obligations).toMatchObject({ owners_decision: 'none', undistributed_minor: K(56000) })
    expect((await finance('Semana F3')).reserve).toMatchObject({ allocated_minor: 0, used_minor: K(5000) })
  })

  it('previous comparison and average of 3 (Slice 01 rule); a zero reference gives no percentage', async () => {
    const f = await finance('Semana F4')
    expect(f.comparison.previous).toMatchObject({ available: true, period: { label: 'Semana F3' } })
    expect(metric(f, 'production_minor')).toMatchObject({ current: K(220000), previous: K(200000), average_3: 20333333,
      change_previous: { delta_minor: K(20000), percent: 10 }, change_average_3: { delta_minor: K(220000) - 20333333, percent: 8.2 } })
    expect(metric(f, 'operating_result_minor').change_previous).toEqual({ delta_minor: -K(8000), percent: -11.6 })
    expect(f.result_change).toEqual({ delta_minor: -K(8000), percent: -11.6 })
    expect(metric((await finance('Semana F5')), 'purchases_salon_minor').change_previous).toEqual({ delta_minor: -K(23000), percent: -100 })
    const f6 = await finance('Semana F6')
    expect(f6.comparison.previous).toMatchObject({ available: false, reason: 'previous_not_closed' })
    expect(f6.metrics.every((m) => m.change_previous === null && m.previous === null)).toBe(true)
    expect(f6.drivers).toEqual([])
  })

  it('insufficient history: no previous for F1, no average before three closed periods', async () => {
    const f1 = await finance('Semana F1')
    expect(f1.comparison.previous.reason).toBe('no_previous_period')
    expect(f1.comparison.average_3.reason).toBe('insufficient_history')
    expect(f1.metrics.every((m) => m.average_3 === null && m.change_average_3 === null)).toBe(true)
    expect((await finance('Semana F3')).comparison.average_3).toMatchObject({ available: false, reason: 'insufficient_history' })
    expect(f1.indicators.retention_average_3_pct).toBeNull()
  })

  it('drivers: the largest changes among team earnings, expense categories and salon purchases', async () => {
    const f = await finance('Semana F4')
    expect(f.drivers).toEqual([
      { kind: 'purchases_salon', label: null, current_minor: K(23000), previous_minor: K(10000), delta_minor: K(13000), percent: 130 },
      { kind: 'team_earnings', label: null, current_minor: K(88000), previous_minor: K(80000), delta_minor: K(8000), percent: 10 },
      { kind: 'expense_category', label: 'Materiais', current_minor: K(18000), previous_minor: K(11000), delta_minor: K(7000), percent: 63.6 }])
  })

  it('zero production: no ratio, no retention', async () => {
    const f8 = await finance('Semana F8')
    expect(metric(f8, 'production_minor').current).toBe(0)
    expect(f8.indicators).toMatchObject({ operating_cost_ratio_pct: null, retention_pct: null })
  })

  it('trend: recent comparable periods, oldest first, with retention', async () => {
    const t = (await finance('Semana F8')).trend
    expect(t.map((x) => x.label)).toEqual(['Semana F3', 'Semana F4', 'Semana F5', 'Semana F6', 'Semana F7', 'Semana F8'])
    expect(t[1]).toMatchObject({ production_minor: K(220000), operating_result_minor: K(61000), retention_pct: 27.7, private_fields: [] })
  })

  it('finance insights in context: result down while production up (purchases lead it), category high; payments pending', async () => {
    const h = (await dev.rpc('business_health', { p_period_id: P['Semana F4'] })).data as BusinessHealth
    const c = (await dev.rpc('business_costs', { p_period_id: P['Semana F4'] })).data as BusinessCosts
    const r = buildInsights(h, money, undefined, undefined, undefined, c).insights
    expect(r.map((i) => i.kind)).toEqual(expect.arrayContaining(['production_up_result_down', 'expense_category_high']))
    // purchases lead the "result down" drivers, so the separate "purchases up" card is folded into it (Slice 04 rule)
    expect(r.find((i) => i.kind === 'production_up_result_down')!.detail.drivers[0]!.label).toBe('Compras (parte do salão)')
    expect(r.map((i) => i.kind)).not.toContain('purchases_up')
    const h8 = (await dev.rpc('business_health', { p_period_id: P['Semana F8'] })).data as BusinessHealth
    expect(buildInsights(h8, money).insights.map((i) => i.kind)).toContain('payments_pending')     // F5, still owed
  })
})

describe('business-only viewer: hidden where a figure resolves to one other person (07 D9 · B11)', () => {
  let m: Record<string, BusinessFinance>
  beforeAll(async () => {
    await as(MANAGER)
    m = { F5: await finance('Semana F5'), F6: await finance('Semana F6'), F7: await finance('Semana F7') }
    await as(BUSINESS_ONLY)
  })

  it('safe aggregates stay visible (two earners, nobody alone)', async () => {
    const f = await finance('Semana F4')
    expect(f.private_fields).toEqual([])
    expect(metric(f, 'operating_result_minor').current).toBe(K(61000))
    expect(f.indicators.retention_pct).toBe(27.7)
    expect(f.drivers).toHaveLength(3)
    expect(f.obligations).toMatchObject({ paid_team_minor: K(88000), undistributed_minor: K(21000) })
  })

  it('one other person owed: unpaid hidden, and paid with it (paid + unpaid = earnings − advances)', async () => {
    const f = await finance('Semana F5')
    expect(f.private_fields).toEqual(['unpaid_team_minor', 'paid_team_minor'])
    expect(f.obligations).toMatchObject({ unpaid_team_minor: null, paid_team_minor: null })
    const seen = numbers(f)
    for (const v of [m.F5.obligations.unpaid_team_minor, m.F5.obligations.paid_team_minor]) expect(seen, String(v)).not.toContain(v)
    expect(metric(f, 'operating_result_minor').current).toBe(K(80000))        // two earners: the result stays
  })

  it('one earner: earnings and every figure containing them hidden, with their comparisons, ratios and trend points', async () => {
    const f = await finance('Semana F6')
    for (const k of ['team_earnings_minor', 'operating_costs_minor', 'operating_result_minor', 'free_minor'] as const) {
      expect(metric(f, k), k).toMatchObject({ current: null, hidden: true, change_previous: null, change_average_3: null })
    }
    expect(f.indicators).toMatchObject({ operating_cost_ratio_pct: null, retention_pct: null, retention_change_previous_pp: null })
    expect(f.result_change).toBeNull()
    expect(f.drivers.some((d) => d.kind === 'team_earnings')).toBe(false)
    expect(metric(f, 'production_minor').current).toBe(K(100000))
    const t = (await finance('Semana F8')).trend.find((x) => x.label === 'Semana F6')!
    expect(t).toMatchObject({ operating_result_minor: null, retention_pct: null, private_fields: ['operating_result_minor', 'retention_pct'] })
    const team = metric(m.F6, 'team_earnings_minor').current!
    const seen = numbers(f)
    // (F6's result, 30.000, equals its Renda expense — a visible figure in its own right — so it is not checked by value)
    for (const v of [team, metric(m.F6, 'operating_costs_minor').current]) expect(seen, String(v)).not.toContain(v)
    for (const v of seen.filter((x) => x !== K(30000))) expect(K(100000) - K(30000) - v, String(v)).not.toBe(team)   // minus the expense itself
    expect(JSON.stringify(f)).not.toMatch(/_earners|_owed|_paid|_advanced|_excess|Profissional F/)
  })

  it('one other person above earnings: Livre and Não distribuído hidden (result − Livre − reserve would give it)', async () => {
    const f = await finance('Semana F7')
    expect(f.private_fields).toEqual(['free_minor'])
    expect(metric(f, 'free_minor')).toMatchObject({ current: null, hidden: true })
    expect(metric(f, 'operating_result_minor').current).toBe(K(30000))
    expect(metric(m.F7, 'free_minor').current).toBe(0)                       // the manager sees it
    const h = (await dev.rpc('business_health', { p_period_id: P['Semana F7'] })).data as BusinessHealth
    expect(h.current.free_minor).toBeNull()                                   // the overview follows the same rule
  })

  it('no person-level figure anywhere', async () => {
    for (const label of ['Semana F1', 'Semana F4', 'Semana F5', 'Semana F7'])
      expect(JSON.stringify(await finance(label)).match(/.{20}(person_id|display_name|advance|earned_minor|outstanding|"lines").{10}/)?.[0], label).toBeUndefined()
  })
})
