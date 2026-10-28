// Business Health Slice 06 — Negócio → Insights over the real, privacy-redacted reads (business_health, business_team,
// business_services, business_costs) and the one insight engine (src/modules/business/insights.ts). No new read model:
// the hub is built from exactly what each viewer receives. Fixtures: "Teste Finanças F", supabase/seeds/16_business_finance.sql.
// One anonymous device for the whole file.
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { device } from './env'
import { buildInsightHub, buildInsights, generateInsights, type InsightInputs } from '../../src/modules/business/insights'
import type { BusinessCosts, BusinessHealth, BusinessServices, BusinessTeam } from '../../src/modules/business/types'

const id = (s: string) => `00000000-0000-4000-8000-0000000077${s}`
const K = (kz: number) => kz * 100
const MANAGER = id('a5'), BUSINESS_ONLY = id('a6'), NO_PERMS = id('a7'), PRO_B = id('a2')
const PIN: Record<string, string> = { [MANAGER]: '717171', [BUSINESS_ONLY]: '727272', [NO_PERMS]: '737373', [PRO_B]: '747474' }
const A_OCT = '00000000-0000-4000-8000-0000000ca802'           // a period of test organization A
const money = (m: number) => `${m / 100} Kz`
type Row = Record<string, any>                                 // eslint-disable-line @typescript-eslint/no-explicit-any

let dev: SupabaseClient
const P: Record<string, string> = {}
async function as(person: string) {
  const r = await dev.rpc('verify_person', { p_person_id: person, p_secret: PIN[person], p_scope: 'private_session' })
  expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
}
async function read<T>(fn: string, p: string | null): Promise<T> {
  const r = await dev.rpc(fn, { p_period_id: p })
  expect(r.error, `${fn}: ${r.error?.message}`).toBeNull()
  return r.data
}
/** What the Insights page reads for one period. */
const inputs = async (label: string | null): Promise<InsightInputs> => {
  const p = label === null ? null : P[label]!
  return { health: await read<BusinessHealth>('business_health', p), team: await read<BusinessTeam>('business_team', p),
           services: await read<BusinessServices>('business_services', p), costs: await read<BusinessCosts>('business_costs', p) }
}
const hub = async (label: string) => buildInsightHub(await inputs(null), await inputs(label), money)
const numbers = (v: unknown): number[] => typeof v === 'number' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(numbers) : []

beforeAll(async () => {
  dev = await device('TEST-ORG-F-2026')
  await as(MANAGER)
  for (const p of (await dev.rpc('business_periods')).data as Row[]) P[p.label] = p.id
})

describe('access: the reads behind Insights', () => {
  it('a private session, then business.health.read; another organization\'s period is rejected', async () => {
    await dev.rpc('end_private_context')
    for (const fn of ['business_health', 'business_team', 'business_services', 'business_costs'])
      expect((await dev.rpc(fn, { p_period_id: null })).error?.message, fn).toBe('VERIFICATION_REQUIRED')
    await as(NO_PERMS)
    for (const fn of ['business_health', 'business_team', 'business_services', 'business_costs'])
      expect((await dev.rpc(fn, { p_period_id: P['Semana F4'] })).error?.message, fn).toBe('NOT_AUTHORIZED')
    await as(BUSINESS_ONLY)
    expect((await dev.rpc('business_health', { p_period_id: A_OCT })).error?.message).toBe('CROSS_TENANT_REFERENCE')
  })
})

describe('team.finance.read viewer', () => {
  beforeAll(async () => { await as(MANAGER) })

  it('open situations now, the selected period\'s analysis; sources and periods', async () => {
    const h = await hub('Semana F4')
    const pending = h.active.find((i) => i.kind === 'payments_pending')!
    expect(pending).toMatchObject({ scope: 'state', source: 'financas', severity: 'INFORMATION' })   // a normal outstanding balance
    expect(pending.periods.map((p) => p.label)).toEqual(expect.arrayContaining(['Semana F5', 'Semana F9', 'Semana F10']))
    expect(pending.impact_minor).toBe(K(30000) + K(70000) + K(69000))
    // result −8.000 before Materiais +7.000 above its average (money at stake); purchases up folded in (Slice 04 rule)
    expect(h.period.map((i) => i.kind)).toEqual(['production_up_result_down', 'expense_category_high'])
    expect(h.period.every((i) => i.period_id === P['Semana F4'] && i.scope === 'period')).toBe(true)
    expect(h.period.find((i) => i.kind === 'expense_category_high')!.source).toBe('custos')
    expect(h.counts.ACTION_REQUIRED).toBe(h.active.filter((i) => i.severity === 'ACTION_REQUIRED').length)
  })

  it('the overview is the first 5 of the same list', async () => {
    const x = await inputs('Semana F4')
    const all = generateInsights(x.health, money, undefined, x.team, x.services, x.costs).insights
    expect(buildInsights(x.health, money, undefined, x.team, x.services, x.costs).insights).toEqual(all.slice(0, 5))
  })

  it('history: another period, its own analysis; insufficient history, no claim', async () => {
    const f1 = await hub('Semana F1')
    expect(f1.period.map((i) => i.kind)).toEqual(['team_concentration'])           // needs no history; nothing comparative
    expect(f1.skipped).toContainEqual({ kind: 'production_up_result_down', reason: 'no_previous_period' })
    expect(f1.skipped).toContainEqual({ kind: 'expense_category_high', reason: 'insufficient_history' })
    expect((await hub('Semana F9')).skipped).toContainEqual({ kind: 'production_up_result_down', reason: 'previous_not_approved' })   // F8 is Aberto
  })
})

describe('business-only viewers: only what the reads already show them (07 D9 · B11)', () => {
  let managerUnpaid: Record<string, number>
  beforeAll(async () => {
    await as(MANAGER)
    const h = await read<BusinessHealth>('business_health', P['Semana F10']!)
    managerUnpaid = Object.fromEntries(h.open_periods.map((p) => [p.label, p.unpaid_team_minor ?? 0]))
  })

  it('a hidden unpaid total feeds no insight: only the visible one is counted', async () => {
    await as(BUSINESS_ONLY)
    const h = await hub('Semana F4')
    const pending = h.active.find((i) => i.kind === 'payments_pending')!
    expect(pending.periods.map((p) => p.label)).toEqual(['Semana F10'])           // F5 (one owed) and F9 (one advanced) hidden
    expect(pending.title).toBe(`A pagar à equipa (acumulado): ${money(K(69000))}.`)
    const txt = JSON.stringify(h)
    for (const label of ['Semana F5', 'Semana F9']) expect(txt, label).not.toContain(money(managerUnpaid[label]!))
    expect(txt).not.toMatch(/Profissional F|person_id|display_name/)
  })

  it('the viewer\'s own position: B sees no other person\'s amount', async () => {
    await as(PRO_B)
    const h = await hub('Semana F4')
    const pending = h.active.find((i) => i.kind === 'payments_pending')
    // F5's 30.000 is B's own outstanding amount; F9 and F10 would give A's
    expect(pending?.periods.map((p) => p.label) ?? []).not.toEqual(expect.arrayContaining(['Semana F9']))
    expect(JSON.stringify(h)).not.toContain(money(K(70000)))
    expect(JSON.stringify(h)).not.toContain(money(K(69000)))
  })

  it('one earner (F6): nothing built from the hidden earnings or result', async () => {
    await as(MANAGER)
    const m = (await inputs('Semana F6')).health.current
    await as(BUSINESS_ONLY)
    const x = await inputs('Semana F6')
    expect(x.health.current.private_fields).toEqual(expect.arrayContaining(['team_earnings_minor', 'operating_result_minor']))
    const h = buildInsightHub(await inputs(null), x, money)
    const seen = numbers(h.period)
    for (const v of [m.team_earnings_minor, m.operating_costs_minor]) expect(seen, String(v)).not.toContain(v)
    expect(JSON.stringify(h.period)).not.toMatch(/Ganhos da equipa|resultado/i)
  })
})
