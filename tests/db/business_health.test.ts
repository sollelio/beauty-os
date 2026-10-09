// Business Health Slice 01 — business_health read model (supabase/migrations/20261008000100) and the core insights
// built from it (src/modules/business/insights.ts). Fixtures: "Teste Negócio E", supabase/seeds/10_business_health.sql.
// One anonymous device for the whole file: the people switch by opening a new private session (it supersedes).
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { device } from './env'
import { buildInsights } from '../../src/modules/business/insights'
import type { BusinessHealth } from '../../src/modules/business/types'

const id = (s: string) => `00000000-0000-4000-8000-00000000${s}`
const K = (kz: number) => kz * 100
const MANAGER = id('e202'), BUSINESS_ONLY = id('e203'), NO_PERMS = id('e204'), PRO = id('e201')
const PIN: Record<string, string> = { [MANAGER]: '515151', [BUSINESS_ONLY]: '525252', [NO_PERMS]: '535353' }
const A_OCT = '00000000-0000-4000-8000-0000000ca802'           // a period of test organization A
const money = (m: number) => `${m / 100} Kz`
type Row = Record<string, any>                                 // eslint-disable-line @typescript-eslint/no-explicit-any

let dev: SupabaseClient
const P: Record<string, string> = {}
async function as(person: string) {
  const r = await dev.rpc('verify_person', { p_person_id: person, p_secret: PIN[person], p_scope: 'private_session' })
  expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
}
async function health(period: string | null): Promise<BusinessHealth> {
  const r = await dev.rpc('business_health', { p_period_id: period })
  expect(r.error, r.error?.message).toBeNull()
  return r.data
}
const kinds = async (label: string) => buildInsights(await health(P[label]!), money).insights.map((i) => i.kind)
const err = async (fn: string, args: Row = {}) => (await dev.rpc(fn, args)).error?.message

beforeAll(async () => {
  dev = await device('TEST-ORG-E-2026')
  await as(MANAGER)
  for (const p of (await dev.rpc('business_periods')).data as Row[]) P[p.label] = p.id
})

describe('access', () => {
  it('requires a private session, then business.health.read', async () => {
    await dev.rpc('end_private_context')
    expect(await err('business_health')).toBe('VERIFICATION_REQUIRED')
    expect(await err('business_periods')).toBe('VERIFICATION_REQUIRED')
    await as(NO_PERMS)
    expect((await dev.rpc('private_context_status')).data).toMatchObject({ active: true, view: 'self', business_health: false })
    expect(await err('business_health')).toBe('NOT_AUTHORIZED')
    expect(await err('business_periods')).toBe('NOT_AUTHORIZED')
  })

  it('business.health.read without team.finance.read: Business Health yes, individual finance no', async () => {
    await as(BUSINESS_ONLY)
    expect((await dev.rpc('private_context_status')).data).toMatchObject({ view: 'self', business_health: true })
    const h = await health(P['Semana E6']!)
    expect(h.current.production_minor).toBe(K(90000))
    const raw = JSON.stringify(h)
    for (const leak of [PRO, 'Profissional Teste E', 'Contextual Teste E', 'person_id', 'display_name', 'advances', 'remaining', 'people'])
      expect(raw, leak).not.toContain(leak)
    for (const fn of ['fecho_period', 'fecho_money', 'fecho_history']) expect(await err(fn, { p_period_id: P['Semana E6'] }), fn).toBe('NOT_AUTHORIZED')
    expect(await err('fecho_periods')).toBe('NOT_AUTHORIZED')
    expect(await err('team_people')).toBe('NOT_AUTHORIZED')
    expect(await err('team_situation', { p_person_id: PRO })).toBe('NOT_AUTHORIZED')
    expect(await err('team_history', { p_person_id: PRO })).toBe('NOT_AUTHORIZED')
  })

  it('another organization\'s period is rejected; no direct table access', async () => {
    await as(MANAGER)
    expect(await err('business_health', { p_period_id: A_OCT })).toBe('CROSS_TENANT_REFERENCE')
    for (const t of ['periods', 'period_close_statements', 'expenses']) expect((await dev.from(t).select('*').limit(1)).error?.code, t).toBe('42501')
  })
})

describe('overview figures', () => {
  it('match the Fecho authoritative outputs (closed, approved, open with a pending rule, current)', async () => {
    await as(MANAGER)
    for (const label of ['Semana E5', 'Semana E6', 'Semana E7', 'Actual E8']) {
      const h = await health(P[label]!)
      const f = (await dev.rpc('fecho_period', { p_period_id: P[label] })).data as Row
      const pos = f.position
      expect(h.current.source, label).toBe(f.source)
      expect(h.current.production_minor, label).toBe(pos.production.total_minor)
      expect(h.current.free_minor, label).toBe(pos.livre_minor)
      expect(h.current.unpaid_team_minor, label).toBe(f.approval ? f.approval.outstanding_minor : null)
      const costs = pos.pending.length ? null : pos.team_earned_minor + pos.expenses.total_minor + pos.purchases.salon_minor
      expect(h.current.operating_costs_minor, label).toBe(costs)
      expect(h.current.operating_result_minor, label).toBe(costs === null ? null : pos.production.total_minor - costs)
    }
  })

  it('Semana E5: definitions, cancelled records excluded', async () => {
    const c = (await health(P['Semana E5']!)).current
    expect(c).toMatchObject({ source: 'close_statement', production_minor: K(120000), services_count: 12, team_earnings_minor: K(48000),
      expenses_minor: K(23500), purchases_salon_minor: K(10000), operating_costs_minor: K(81500), operating_result_minor: K(38500),
      retention_pct: 32.1, unpaid_team_minor: 0 })                 // not 170.000 / X 120.000: the cancelled service and expense
  })

  it('closed period: the close statement stands although its live recalculation would differ', async () => {
    const c = (await health(P['Semana E2']!)).current
    expect(c.source).toBe('close_statement')
    expect(c.team_earnings_minor).toBe(K(39000))                   // with the later 90% rule it would be 45.000
    expect(c.operating_result_minor).toBe(K(55000))
  })

  it('pending rule: costs, result, retention and Livre undefined; nothing approved', async () => {
    const h = await health(P['Semana E7']!)
    expect(h.current).toMatchObject({ pending_rules_count: 1, operating_costs_minor: null, operating_result_minor: null, retention_pct: null,
      free_minor: null, unpaid_team_minor: null, approved: false })
  })

  it('a cancelled live record leaves the figures as they were', async () => {
    const before = (await health(null)).current
    expect(before.period.label).toBe('Actual E8')
    const rec = await dev.rpc('record_service', { p_command_id: randomUUID(), p_person_id: PRO, p_service_id: id('e301'), p_value_minor: K(7000),
      p_payments: [{ method_id: id('e101'), amount_minor: K(7000) }] })
    expect(rec.error).toBeNull()
    expect((await health(null)).current.production_minor).toBe(before.production_minor + K(7000))
    const g = await dev.rpc('verify_person', { p_person_id: MANAGER, p_secret: PIN[MANAGER] })
    const cancel = await dev.rpc('cancel_record', { p_command_id: randomUUID(), p_grant_id: g.data.grant_id, p_kind: 'service', p_record_id: rec.data.record_id, p_reason: 'teste' })
    expect(cancel.error).toBeNull()
    const after = (await health(null)).current
    expect(after.production_minor).toBe(before.production_minor)
    expect(after.services_count).toBe(before.services_count)
  })
})

describe('comparison', () => {
  it('previous period: Semana E5 vs E4', async () => {
    const h = await health(P['Semana E5']!)
    expect(h.meta).toMatchObject({ is_complete: true, history_count: 4, baseline: 'previous_and_average_3' })
    expect(h.meta.comparison.previous).toMatchObject({ available: true, reason: null, period: { label: 'Semana E4' } })
    expect(h.changes.previous!.production_minor).toEqual({ delta_minor: K(20000), percent: 20 })
    expect(h.changes.previous!.operating_result_minor).toEqual({ delta_minor: -K(13500), percent: -26 })
  })

  it('average of the 3 previous closed periods', async () => {
    const h = await health(P['Semana E5']!)
    expect(h.average_3!.periods.map((p) => p.label)).toEqual(['Semana E4', 'Semana E3', 'Semana E2'])
    expect(h.average_3!.production_minor).toBe(9333333)
    expect(h.average_3!.operating_result_minor).toBe(4966667)
    expect(h.changes.average_3!.production_minor.percent).toBe(28.6)
    const x = h.expense_categories.find((c) => c.label === 'Categoria X')!
    expect(x).toMatchObject({ current_minor: K(20000), previous_minor: K(6000), average_3_minor: 533333, reference_presence: 3 })
    expect(h.expense_categories.find((c) => c.label === 'Categoria Y')).toMatchObject({ reference_presence: 1 })
  })

  it('zero reference: a change in value, never a percentage', async () => {
    const h1 = await health(P['Semana E1']!)
    expect(h1.current.production_minor).toBe(0)
    expect(h1.current.retention_pct).toBeNull()
    expect(h1.meta.comparison.previous).toMatchObject({ available: false, reason: 'no_previous_period' })
    const h2 = await health(P['Semana E2']!)
    expect(h2.changes.previous!.production_minor).toEqual({ delta_minor: K(100000), percent: null })
  })

  it('insufficient history, previous not closed, current incomplete', async () => {
    const h3 = await health(P['Semana E3']!)
    expect(h3.meta).toMatchObject({ history_count: 2, baseline: 'previous' })
    expect(h3.meta.comparison.average_3).toMatchObject({ available: false, reason: 'insufficient_history' })
    expect(h3.average_3).toBeNull()
    const h7 = await health(P['Semana E7']!)
    expect(h7.meta.comparison.previous).toMatchObject({ available: false, reason: 'previous_not_closed' })
    expect(h7.changes.previous).toBeNull()
    expect(h7.meta.comparison.average_3.available).toBe(true)
    const h8 = await health(null)
    expect(h8.meta).toMatchObject({ is_complete: false, baseline: 'none' })
    expect(h8.meta.comparison.previous.reason).toBe('current_incomplete')
    expect(h8.changes).toEqual({ previous: null, average_3: null })
  })
})

describe('insights from the read model', () => {

  it('E5: production up / result down, expense category high (X only)', async () => {
    const r = buildInsights(await health(P['Semana E5']!), money)
    expect(r.insights.map((i) => i.kind)).toEqual(['production_up_result_down', 'expense_category_high'])
    const up = r.insights[0]!
    expect(up.detail.drivers.map((d) => d.label)).toEqual(['Despesas', 'Compras (parte do salão)', 'Ganhos da equipa'])
    expect(up.detail.drivers[0]!.text).toBe('+15500 Kz · sobretudo Categoria X +14000 Kz')
    expect(r.insights[1]!.detail.drivers.map((d) => d.label)).toEqual(['Categoria X'])   // Y: 1 of 3 periods · Z: impact below 3%
  })

  it('E6: payments pending and production decline; E7: blocked period first-class, payments of E6 still listed', async () => {
    const r6 = buildInsights(await health(P['Semana E6']!), money)
    expect(r6.insights.map((i) => i.kind)).toEqual(['payments_pending', 'production_decline'])
    expect(r6.insights[0]!.title).toBe('Ainda faltam 30000 Kz por pagar à equipa.')
    expect(await kinds('Semana E7')).toEqual(['payments_pending', 'period_blocked'])
  })

  it('no insight below the thresholds or without the data', async () => {
    expect(await kinds('Semana E3')).toEqual([])                    // −20% but 8 services; no average yet
    expect(buildInsights(await health(P['Semana E3']!), money).skipped).toContainEqual({ kind: 'production_decline', reason: 'not_enough_services' })
    expect(await kinds('Semana E4')).toEqual([])                    // result up; X +64% but its excess < 3% of production
    expect(await kinds('Semana E1')).toEqual([])
    const r8 = buildInsights(await health(null), money)            // current period: only the open action of E6 and E7
    expect(r8.insights.map((i) => i.kind)).toEqual(['payments_pending', 'period_blocked'])
    expect(r8.skipped.map((s) => s.reason)).toEqual(['current_incomplete', 'current_incomplete', 'current_incomplete'])
  })
})

describe('individual finance is not inferable (07 D9 · B11): hidden only where a figure resolves to one other person', () => {
  const HIDDEN = ['team_earnings_minor', 'operating_costs_minor', 'operating_result_minor', 'retention_pct', 'free_minor'] as const
  const numbers = (v: unknown): number[] => typeof v === 'number' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(numbers) : []
  let m6: BusinessHealth, b6: BusinessHealth

  beforeAll(async () => {
    await as(MANAGER); m6 = await health(P['Semana E6']!)          // only e201 earned; only e201 is owed
    await as(BUSINESS_ONLY); b6 = await health(P['Semana E6']!)
  })

  it('1–4 · the remuneration is hidden, and so is every figure that gives it back exactly', async () => {
    expect(m6.current).toMatchObject({ team_earnings_minor: K(36000), operating_costs_minor: K(41000), operating_result_minor: K(49000),
      unpaid_team_minor: K(30000), private_fields: [] })
    expect(m6.current.retention_pct).not.toBeNull()
    expect(m6.current.free_minor).not.toBeNull()
    expect(b6.current.private_fields).toEqual([...HIDDEN, 'unpaid_team_minor'])
    for (const k of [...HIDDEN, 'unpaid_team_minor'] as const) expect(b6.current[k], k).toBeNull()
    for (const k of ['production_minor', 'services_count', 'expenses_minor', 'purchases_salon_minor', 'pending_rules_count', 'approved'] as const)
      expect(b6.current[k], k).toBe(m6.current[k])
    // no value in the whole response is a protected figure, nor gives one back through production − expenses − purchases
    const team = m6.current.team_earnings_minor!, c = m6.current
    const protectedValues = [team, c.operating_costs_minor, c.operating_result_minor, c.free_minor, c.unpaid_team_minor]
    const seen = numbers(b6)
    for (const v of protectedValues) expect(seen, String(v)).not.toContain(v)
    for (const v of seen) expect(c.production_minor - c.expenses_minor - c.purchases_salon_minor - v, String(v)).not.toBe(team)
    expect(JSON.stringify(b6)).not.toMatch(/_earners|_owed/)
    expect(b6.open_periods.find((p) => p.label === 'Semana E6')).toMatchObject({ unpaid_team_minor: null, unpaid_private: true })
  })

  it('5 · comparisons, average-3 and trend carry nothing computed from a hidden figure', async () => {
    const b5 = await health(P['Semana E5']!)                        // E5 and its whole window (E4, E3, E2-as-reference) checked
    for (const k of ['team_earnings_minor', 'operating_costs_minor', 'operating_result_minor', 'free_minor'] as const) {
      expect(b5.changes.previous![k], k).toEqual({ delta_minor: null, percent: null })
      expect(b5.changes.average_3![k], k).toEqual({ delta_minor: null, percent: null })
      expect(b5.average_3![k], k).toBeNull()
    }
    expect(b5.average_3!.private_fields).toEqual(expect.arrayContaining(['team_earnings_minor', 'operating_costs_minor', 'operating_result_minor', 'free_minor']))
    expect(b5.changes.previous!.production_minor).toEqual({ delta_minor: K(20000), percent: 20 })
    expect(b5.average_3!.production_minor).toBe(9333333)
    expect(b5.average_3!.expenses_minor).not.toBeNull()
    expect(b5.trend.find((t) => t.label === 'Semana E5')).toMatchObject({ operating_result_minor: null, result_private: true })
    expect(b5.trend.find((t) => t.label === 'Semana E2')).toMatchObject({ operating_result_minor: K(55000), result_private: false })   // two earners
  })

  it('6 · insights: none built on a hidden figure, and no explanation contains one', async () => {
    const r6 = buildInsights(b6, money)
    expect(r6.insights.map((i) => i.kind)).toEqual(['production_decline'])
    const r5 = buildInsights(await health(P['Semana E5']!), money)
    expect(r5.insights.map((i) => i.kind)).toEqual(['expense_category_high'])   // no "result down" without the result
    expect(r5.skipped).toContainEqual({ kind: 'production_up_result_down', reason: 'figure_hidden' })
    const c = m6.current
    const text = JSON.stringify([r6, r5])
    for (const v of [c.team_earnings_minor!, c.operating_costs_minor!, c.operating_result_minor!]) expect(text).not.toContain(money(v))
  })

  it('7 · two other earners: the safe aggregates stay; a viewer who is one of the two earners cannot get the other\'s pay', async () => {
    const b2 = await health(P['Semana E2']!)                        // e201 and e206 earned; the viewer is neither
    expect(b2.current).toMatchObject({ team_earnings_minor: K(39000), operating_costs_minor: K(45000), operating_result_minor: K(55000),
      unpaid_team_minor: 0, private_fields: [] })
    expect(b2.current.retention_pct).not.toBeNull()
    expect(b2.current.free_minor).not.toBeNull()
    expect(b2.changes.previous!.operating_result_minor.delta_minor).not.toBeNull()
    const r = await dev.rpc('verify_person', { p_person_id: id('e206'), p_secret: '545454', p_scope: 'private_session' })
    expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
    const own = await health(P['Semana E2']!)                       // e206 knows its own share: the rest would be e201's
    expect(own.current.private_fields).toEqual([...HIDDEN])
    expect(own.current.unpaid_team_minor).toBe(0)                   // nobody is owed: nothing to protect
  })

  it('8 · team.finance.read receives the complete values', async () => {
    await as(MANAGER)
    const m5 = await health(P['Semana E5']!)
    expect(m5.current).toMatchObject({ team_earnings_minor: K(48000), operating_result_minor: K(38500), private_fields: [] })
    expect(m5.average_3).toMatchObject({ operating_result_minor: 4966667, private_fields: [] })
    expect(m5.changes.previous!.operating_result_minor).toEqual({ delta_minor: -K(13500), percent: -26 })
  })
})
