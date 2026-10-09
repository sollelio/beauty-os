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
const row = (t: BusinessTeam, name: string) => t.people.find((p) => p.display_name === name)!

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

describe('team figures (business-only viewer)', () => {
  it('per professional: services, production, average ticket, share; matches the Fecho production', async () => {
    const t = await team('Semana D2')
    expect(t.summary).toEqual({ production_minor: K(200000), services_count: 21, average_ticket_minor: 952381, active_count: 4 })
    expect(t.people.map((p) => p.display_name)).toEqual(['Profissional D1', 'Profissional D2', 'Profissional D3', 'Profissional D4'])
    expect(row(t, 'Profissional D2')).toMatchObject({ services_count: 6, production_minor: K(66000), average_ticket_minor: K(11000), share_pct: 33 })
    expect(row(t, 'Profissional D3')).toMatchObject({ services_count: 4, production_minor: K(32000), average_ticket_minor: K(8000), share_pct: 16 })
    const h = (await dev.rpc('business_health', { p_period_id: P['Semana D2'] })).data as BusinessHealth
    expect(t.summary.production_minor).toBe(h.current.production_minor)
    expect(t.summary.services_count).toBe(h.current.services_count)
  })

  it('a cancelled service is excluded (and its professional is not active)', async () => {
    const t = await team('Semana D3')
    expect(t.summary).toMatchObject({ production_minor: K(100000), services_count: 10, active_count: 2 })
    expect(t.people.map((p) => p.display_name)).toEqual(['Profissional D1', 'Profissional D2'])
  })

  it('zero production: no professionals, no average ticket, no share', async () => {
    const t = await team('Semana D4')
    expect(t.summary).toEqual({ production_minor: 0, services_count: 0, average_ticket_minor: null, active_count: 0 })
    expect(t.people).toEqual([])
    expect(teamConcentration(t)).toEqual({})
  })

  it('previous comparable period: change per professional; no reference production gives no percentage', async () => {
    const t = await team('Semana D2')
    expect(t.comparison).toMatchObject({ available: true, reason: null, period: { label: 'Semana D1' } })
    expect(row(t, 'Profissional D1')).toMatchObject({ previous_production_minor: K(100000), change: { delta_minor: -K(30000), percent: -30 } })
    expect(row(t, 'Profissional D2').change).toEqual({ delta_minor: K(16000), percent: 32 })
    expect(row(t, 'Profissional D4')).toMatchObject({ previous_production_minor: 0, change: { delta_minor: K(32000), percent: null } })
  })

  it('unavailable comparison: a reason, never a 0% change', async () => {
    const t1 = await team('Semana D1')
    expect(t1.comparison).toMatchObject({ available: false, reason: 'no_previous_period', period: null })
    expect(t1.people.every((p) => p.change === null && p.previous_production_minor === null)).toBe(true)
    const t5 = await team('Semana D5')
    expect(t5.comparison).toMatchObject({ available: false, reason: 'previous_not_closed', period: { label: 'Semana D4' } })
    expect(t5.people.every((p) => p.change === null)).toBe(true)
  })

  it('no private financial field for anyone; the overview keeps the safe aggregates of a four-person team', async () => {
    for (const label of ['Semana D1', 'Semana D2', 'Semana D5']) {
      const t = await team(label)
      expect(Object.keys(t).sort(), label).toEqual(['comparison', 'people', 'period', 'summary'])
      for (const p of t.people) expect(Object.keys(p).sort(), label).toEqual(PERSON_KEYS)
      expect(JSON.stringify(t)).not.toMatch(/earned|advance|payment|remaining|excess|rule|outstanding/)
    }
    const h = (await dev.rpc('business_health', { p_period_id: P['Semana D2'] })).data as BusinessHealth
    expect(h.current).toMatchObject({ production_minor: K(200000), team_earnings_minor: K(73600), operating_result_minor: K(126400), private_fields: [] })
    expect(h.current.retention_pct).not.toBeNull()
    expect(h.current.free_minor).not.toBeNull()
    const h5 = (await dev.rpc('business_health', { p_period_id: P['Semana D5'] })).data as BusinessHealth   // approved, four people owed
    expect(h5.current).toMatchObject({ approved: true, unpaid_team_minor: K(30000 * 0.4 * 2 + 30000 * 0.3 + 10000 * 0.3), private_fields: [] })
    expect(await err('team_situation', { p_person_id: D1 })).toBe('NOT_AUTHORIZED')      // no finance drill-down
  })
})

describe('team concentration insight', () => {
  it('one professional ≥ 40% (with 3 active)', async () => {
    const { insight } = teamConcentration(await team('Semana D1'))
    expect(insight).toMatchObject({ kind: 'team_concentration', severity: 'ATTENTION', title: '50% da produção está concentrada num profissional.' })
  })

  it('the two largest ≥ 65% when none reaches 40%', async () => {
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

describe('team.finance.read viewer', () => {
  it('gets the same Business Health team response; the existing situation view is the finance drill-down', async () => {
    await as(MANAGER)
    const t = await team('Semana D2')
    for (const p of t.people) expect(Object.keys(p).sort()).toEqual(PERSON_KEYS)
    const s = await dev.rpc('team_situation', { p_person_id: D1, p_period_id: P['Semana D2'] })
    expect(s.error, s.error?.message).toBeNull()
    expect(s.data.person.display_name).toBe('Profissional D1')
    const h = (await dev.rpc('business_health', { p_period_id: P['Semana D2'] })).data as BusinessHealth
    expect(h.current).toMatchObject({ team_earnings_minor: K(28000 + 26400 + 9600 + 9600), private_fields: [] })
  })
})
