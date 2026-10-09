// Business Health Slice 02 — business_team read model (supabase/migrations/20261010000100) and the team concentration
// insight built from it (src/modules/business/insights.ts). Fixtures: "Teste Equipa D", supabase/seeds/11_business_team.sql.
// One anonymous device for the whole file: the people switch by opening a new private session (it supersedes).
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { device } from './env'
import { buildInsights, teamConcentration } from '../../src/modules/business/insights'
import type { BusinessHealth, BusinessTeam } from '../../src/modules/business/types'

const id = (s: string) => `00000000-0000-4000-8000-00000000${s}`
const K = (kz: number) => kz * 100
const MANAGER = id('dd25'), BUSINESS_ONLY = id('dd26'), NO_PERMS = id('dd27'), D1 = id('dd21')
const PIN: Record<string, string> = { [MANAGER]: '616161', [BUSINESS_ONLY]: '626262', [NO_PERMS]: '636363' }
const A_OCT = '00000000-0000-4000-8000-0000000ca802'           // a period of test organization A
const money = (m: number) => `${m / 100} Kz`
const PERSON_KEYS = ['average_ticket_minor', 'change', 'display_name', 'person_id', 'previous_production_minor', 'production_minor', 'services_count', 'share_pct']

let dev: SupabaseClient
const P: Record<string, string> = {}
async function as(person: string) {
  const r = await dev.rpc('verify_person', { p_person_id: person, p_secret: PIN[person], p_scope: 'private_session' })
  expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
}
async function team(label: string): Promise<BusinessTeam> {
  const r = await dev.rpc('business_team', { p_period_id: P[label] })
  expect(r.error, r.error?.message).toBeNull()
  return r.data
}
const err = async (fn: string, args: Record<string, unknown> = {}) => (await dev.rpc(fn, args)).error?.message
const row = (t: BusinessTeam, name: string) => t.people!.find((p) => p.display_name === name)!

beforeAll(async () => {
  dev = await device('TEST-ORG-D-2026')
  await as(BUSINESS_ONLY)
  for (const p of (await dev.rpc('business_periods')).data as { id: string; label: string }[]) P[p.label] = p.id
})

describe('access', () => {
  it('requires a private session, then business.health.read; another organization\'s period is rejected', async () => {
    await dev.rpc('end_private_context')
    expect(await err('business_team')).toBe('VERIFICATION_REQUIRED')
    await as(NO_PERMS)
    expect(await err('business_team', { p_period_id: P['Semana D1'] })).toBe('NOT_AUTHORIZED')
    await as(BUSINESS_ONLY)
    expect(await err('business_team', { p_period_id: A_OCT })).toBe('CROSS_TENANT_REFERENCE')
  })
})

describe('business-only viewer: the team as a whole, nothing named (07 D9 · B11)', () => {
  const SUMMARY_KEYS = ['active_count', 'average_ticket_minor', 'production_minor', 'services_count', 'top_share_pct', 'top_two_share_pct']

  it('useful aggregate Equipa: production, services, average ticket, active professionals, unnamed distribution', async () => {
    const t = await team('Semana D2')
    expect(t.summary).toEqual({ production_minor: K(200000), services_count: 21, average_ticket_minor: 952381, active_count: 4,
                                top_share_pct: 35, top_two_share_pct: 68 })
    expect(t.people).toBeNull()
    const h = (await dev.rpc('business_health', { p_period_id: P['Semana D2'] })).data as BusinessHealth
    expect(t.summary.production_minor).toBe(h.current.production_minor)
    expect(t.summary.services_count).toBe(h.current.services_count)
  })

  it('a cancelled service is excluded; zero production gives no average ticket and no distribution', async () => {
    expect((await team('Semana D3')).summary).toMatchObject({ production_minor: K(100000), services_count: 10, active_count: 2, top_share_pct: 80, top_two_share_pct: 100 })
    const t4 = await team('Semana D4')
    expect(t4.summary).toEqual({ production_minor: 0, services_count: 0, average_ticket_minor: null, active_count: 0, top_share_pct: null, top_two_share_pct: null })
    expect(teamConcentration(t4)).toEqual({})
  })

  it('across every period: no named or per-person value, no per-person service count, no previous per-person vector', async () => {
    for (const label of ['Semana D1', 'Semana D2', 'Semana D3', 'Semana D4', 'Semana D5']) {
      const t = await team(label)
      expect(Object.keys(t).sort(), label).toEqual(['comparison', 'people', 'period', 'summary'])
      expect(Object.keys(t.summary).sort(), label).toEqual(SUMMARY_KEYS)
      expect(t.people, label).toBeNull()
      expect(Object.keys(t.comparison).sort(), label).toEqual(['available', 'period', 'reason'])
      const h = (await dev.rpc('business_health', { p_period_id: P[label] })).data as BusinessHealth
      for (const raw of [JSON.stringify(t), JSON.stringify(h)])
        expect(raw.match(/.{30}(Profissional D|dd2[1-4]|person_id|display_name|"share_pct"|previous_production|earned|advance|remaining|excess|outstanding).{10}/)?.[0], label).toBeUndefined()
    }
    expect((await team('Semana D1')).comparison).toMatchObject({ available: false, reason: 'no_previous_period' })
    expect((await team('Semana D5')).comparison).toMatchObject({ available: false, reason: 'previous_not_closed' })
    expect(await err('team_situation', { p_person_id: D1 })).toBe('NOT_AUTHORIZED')      // no finance drill-down
  })

  it('the overview keeps its safe aggregate finance', async () => {
    const h = (await dev.rpc('business_health', { p_period_id: P['Semana D2'] })).data as BusinessHealth
    expect(h.current).toMatchObject({ production_minor: K(200000), team_earnings_minor: K(73600), operating_result_minor: K(126400), private_fields: [] })
    expect(h.current.retention_pct).not.toBeNull()
    expect(h.current.free_minor).not.toBeNull()
    const h5 = (await dev.rpc('business_health', { p_period_id: P['Semana D5'] })).data as BusinessHealth   // approved, four people owed
    expect(h5.current).toMatchObject({ approved: true, unpaid_team_minor: K(30000 * 0.4 * 2 + 30000 * 0.3 + 10000 * 0.3), private_fields: [] })
  })
})

describe('team concentration insight (business-only viewer, unnamed)', () => {
  it('one professional ≥ 40% (with 3 active)', async () => {
    const { insight } = teamConcentration(await team('Semana D1'))
    expect(insight).toMatchObject({ kind: 'team_concentration', severity: 'ATTENTION', title: '50% da produção está concentrada num profissional.' })
    expect(JSON.stringify(insight)).not.toMatch(/Profissional D/)
  })

  it('the two largest ≥ 65% when none reaches 40%; it joins the overview insights', async () => {
    const t = await team('Semana D2')
    expect(teamConcentration(t).insight!.title).toBe('68% da produção está concentrada em dois profissionais.')
    const h = (await dev.rpc('business_health', { p_period_id: P['Semana D2'] })).data as BusinessHealth
    expect(buildInsights(h, money, undefined, t).insights.map((i) => i.kind)).toContain('team_concentration')
  })

  it('none with fewer than 3 active professionals, nor below both thresholds', async () => {
    expect(teamConcentration(await team('Semana D3'))).toEqual({ skipped: { kind: 'team_concentration', reason: 'not_enough_professionals' } })
    expect(teamConcentration(await team('Semana D5'))).toEqual({})                         // 30 / 60 with 4 active
  })
})

describe('team.finance.read viewer: the full Equipa', () => {
  beforeAll(async () => { await as(MANAGER) })

  it('per professional: services, production, average ticket, share; no private financial field', async () => {
    const t = await team('Semana D2')
    expect(t.summary).toMatchObject({ production_minor: K(200000), active_count: 4, top_share_pct: 35, top_two_share_pct: 68 })
    expect(t.people!.map((p) => p.display_name)).toEqual(['Profissional D1', 'Profissional D2', 'Profissional D3', 'Profissional D4'])
    expect(row(t, 'Profissional D2')).toMatchObject({ services_count: 6, production_minor: K(66000), average_ticket_minor: K(11000), share_pct: 33 })
    expect(row(t, 'Profissional D3')).toMatchObject({ services_count: 4, production_minor: K(32000), average_ticket_minor: K(8000), share_pct: 16 })
    for (const p of t.people!) expect(Object.keys(p).sort()).toEqual(PERSON_KEYS)
    expect(JSON.stringify(t)).not.toMatch(/earned|advance|payment|remaining|excess|rule|outstanding/)
    expect((await team('Semana D3')).people!.map((p) => p.display_name)).toEqual(['Profissional D1', 'Profissional D2'])   // cancelled excluded
    expect((await team('Semana D4')).people).toEqual([])
  })

  it('previous comparable period per professional; no reference production gives no percentage; unavailable gives a reason', async () => {
    const t = await team('Semana D2')
    expect(t.comparison).toMatchObject({ available: true, reason: null, period: { label: 'Semana D1' } })
    expect(row(t, 'Profissional D1')).toMatchObject({ previous_production_minor: K(100000), change: { delta_minor: -K(30000), percent: -30 } })
    expect(row(t, 'Profissional D2').change).toEqual({ delta_minor: K(16000), percent: 32 })
    expect(row(t, 'Profissional D4')).toMatchObject({ previous_production_minor: 0, change: { delta_minor: K(32000), percent: null } })
    const t1 = await team('Semana D1')
    expect(t1.comparison.reason).toBe('no_previous_period')
    expect(t1.people!.every((p) => p.change === null && p.previous_production_minor === null)).toBe(true)
    expect((await team('Semana D5')).people!.every((p) => p.change === null)).toBe(true)
  })

  it('the existing situation view is the finance drill-down; the overview is complete', async () => {
    const s = await dev.rpc('team_situation', { p_person_id: D1, p_period_id: P['Semana D2'] })
    expect(s.error, s.error?.message).toBeNull()
    expect(s.data.person.display_name).toBe('Profissional D1')
    const h = (await dev.rpc('business_health', { p_period_id: P['Semana D2'] })).data as BusinessHealth
    expect(h.current).toMatchObject({ team_earnings_minor: K(28000 + 26400 + 9600 + 9600), private_fields: [] })
  })
})
