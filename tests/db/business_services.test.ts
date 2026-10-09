// Business Health Slice 03 — business_services read model (supabase/migrations/20261010000400) and the service
// insights built from it (src/modules/business/insights.ts). Fixtures: "Teste Serviços S", supabase/seeds/12_business_services.sql.
// One anonymous device for the whole file: the people switch by opening a new private session (it supersedes).
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { device } from './env'
import { buildInsights, serviceInsights } from '../../src/modules/business/insights'
import type { BusinessHealth, BusinessServices } from '../../src/modules/business/types'

const id = (s: string) => `00000000-0000-4000-8000-0000000055${s}`
const K = (kz: number) => kz * 100
const MANAGER = id('a5'), BUSINESS_ONLY = id('a6'), NO_PERMS = id('a7')
const PIN: Record<string, string> = { [MANAGER]: '717171', [BUSINESS_ONLY]: '727272', [NO_PERMS]: '737373' }
const A_OCT = '00000000-0000-4000-8000-0000000ca802'           // a period of test organization A
const money = (m: number) => `${m / 100} Kz`
const ROW_KEYS = ['average_ticket_minor', 'before_previous', 'change', 'count', 'name', 'previous', 'revenue_minor', 'service_id', 'share_pct']

let dev: SupabaseClient
const P: Record<string, string> = {}
async function as(person: string) {
  const r = await dev.rpc('verify_person', { p_person_id: person, p_secret: PIN[person], p_scope: 'private_session' })
  expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
}
async function services(label: string): Promise<BusinessServices> {
  const r = await dev.rpc('business_services', { p_period_id: P[label] })
  expect(r.error, r.error?.message).toBeNull()
  return r.data
}
const err = async (fn: string, args: Record<string, unknown> = {}) => (await dev.rpc(fn, args)).error?.message
const svc = (s: BusinessServices, name: string) => s.services.find((x) => x.name === name)
const kinds = (s: BusinessServices) => serviceInsights(s, money).insights.map((i) => i.kind)

beforeAll(async () => {
  dev = await device('TEST-ORG-S-2026')
  await as(BUSINESS_ONLY)
  for (const p of (await dev.rpc('business_periods')).data as { id: string; label: string }[]) P[p.label] = p.id
})

describe('access', () => {
  it('requires a private session, then business.health.read; another organization\'s period is rejected', async () => {
    await dev.rpc('end_private_context')
    expect(await err('business_services')).toBe('VERIFICATION_REQUIRED')
    await as(NO_PERMS)
    expect(await err('business_services', { p_period_id: P['Semana S4'] })).toBe('NOT_AUTHORIZED')
    await as(BUSINESS_ONLY)
    expect(await err('business_services', { p_period_id: A_OCT })).toBe('CROSS_TENANT_REFERENCE')
  })
})

describe('service figures (business-only viewer)', () => {
  it('count, revenue at the recorded value, average actual ticket, share; the cancelled record excluded; matches Fecho', async () => {
    const s = await services('Semana S4')
    expect(s.summary).toEqual({ production_minor: K(391000), services_count: 59, average_ticket_minor: 662712, distinct_services: 6,
                                top_share_pct: 38, top_two_share_pct: 59 })
    expect(svc(s, 'Corte')).toMatchObject({ count: 30, revenue_minor: K(150000), average_ticket_minor: K(5000), share_pct: 38.4 })
    expect(svc(s, 'Cor')).toMatchObject({ count: 4, revenue_minor: K(80000), average_ticket_minor: K(20000), share_pct: 20.5 })   // not 5: one cancelled
    const h = (await dev.rpc('business_health', { p_period_id: P['Semana S4'] })).data as BusinessHealth
    expect(s.summary.production_minor).toBe(h.current.production_minor)
    expect(s.summary.services_count).toBe(h.current.services_count)
  })

  it('a service with one performer (and enough others for a group of two or more people) is shown only within "Outros serviços"', async () => {
    const s = await services('Semana S4')
    expect(s.services.map((x) => x.name)).toEqual(['Corte', 'Cor', 'Alongamento', 'Pedicure'])
    expect(s.other).toEqual({ services: 2, count: 10, revenue_minor: K(56000) })          // Penteado (only B) + Manicure (smallest)
    const total = s.services.reduce((a, x) => a + x.revenue_minor, 0) + s.other!.revenue_minor
    expect(total).toBe(s.summary.production_minor)
  })

  it('zero production: nothing per service, no ticket, no distribution', async () => {
    const s = await services('Semana S5')
    expect(s.summary).toEqual({ production_minor: 0, services_count: 0, average_ticket_minor: null, distinct_services: 0, top_share_pct: null, top_two_share_pct: null })
    expect(s.services).toEqual([])
    expect(s.other).toBeNull()
    expect(serviceInsights(s, money).insights).toEqual([])
  })

  it('previous and the one before (Slice 01 rule, chained): count and revenue change; an absent reference has no percentage', async () => {
    const s = await services('Semana S4')
    expect(s.comparison.previous).toMatchObject({ available: true, reason: null, period: { label: 'Semana S3' } })
    expect(s.comparison.before_previous).toMatchObject({ available: true, reason: null, period: { label: 'Semana S2' } })
    expect(svc(s, 'Corte')).toMatchObject({ previous: { count: 20, revenue_minor: K(100000) }, before_previous: { count: 20, revenue_minor: K(100000) },
      change: { count: { delta_minor: 10, percent: 50 }, revenue: { delta_minor: K(50000), percent: 50 } } })
    expect(svc(s, 'Pedicure')).toMatchObject({ previous: { count: 7 }, before_previous: { count: 5 } })
    const s5 = await services('Semana S5')
    expect(s5.comparison.previous.available).toBe(true)
    const s2 = await services('Semana S2')
    expect(svc(s2, 'Pedicure')).toMatchObject({ previous: { count: 0, revenue_minor: 0 }, change: { count: { delta_minor: 5, percent: null } } })
  })

  it('unavailable comparison: the reason, no change', async () => {
    const s1 = await services('Semana S1')
    expect(s1.comparison.previous).toMatchObject({ available: false, reason: 'no_previous_period', period: null })
    expect(s1.services.every((x) => x.change === null && x.previous === null)).toBe(true)
    const s2 = await services('Semana S2')
    expect(s2.comparison.before_previous).toMatchObject({ available: false, reason: 'no_previous_period' })
    expect(s2.services.every((x) => x.before_previous === null)).toBe(true)
  })

  it('no professional identity, per-person figure or private finance, in any period', async () => {
    for (const label of ['Semana S1', 'Semana S2', 'Semana S3', 'Semana S4', 'Semana S5']) {
      const s = await services(label)
      expect(Object.keys(s).sort(), label).toEqual(['comparison', 'other', 'period', 'services', 'summary'])
      for (const x of s.services) expect(Object.keys(x).sort(), label).toEqual(ROW_KEYS)
      expect(JSON.stringify(s).match(/.{20}(Profissional|55a[1-7]|person|display_name|earned|advance|remaining|excess|outstanding).{10}/)?.[0], label).toBeUndefined()
      // a service never appears by name in a period where it was not shown on its own (Manicure, Penteado: S2–S4)
      if (label !== 'Semana S1') expect(s.services.map((x) => x.name), label).not.toContain('Penteado')
    }
  })
})

describe('service insights', () => {
  it('concentration: one service ≥ 35%, or two ≥ 55%, with at least 5 services performed; unnamed', async () => {
    const s4 = serviceInsights(await services('Semana S4'), money).insights.find((i) => i.kind === 'service_concentration')!
    expect(s4).toMatchObject({ severity: 'INFORMATION', title: 'Um serviço representa 38% da produção.' })
    expect(serviceInsights(await services('Semana S3'), money).insights.find((i) => i.kind === 'service_concentration')!.title)
      .toBe('Dois serviços representam 57% da produção.')
    expect(serviceInsights(await services('Semana S1'), money).skipped).toContainEqual({ kind: 'service_concentration', reason: 'not_enough_services_performed' })
  })

  it('growth and decline over two consecutive comparisons, from a large enough base', async () => {
    const r = serviceInsights(await services('Semana S4'), money)
    expect(r.insights.map((i) => i.kind)).toEqual(['service_decline', 'service_concentration', 'service_growth'])
    const decline = r.insights[0]!, growth = r.insights[2]!
    expect(decline).toMatchObject({ severity: 'ATTENTION', title: 'Alongamento caiu pelo segundo período consecutivo.' })
    expect(decline.detail.reference).toBe('Alongamento: 10 → 8 → 6')
    expect(decline.detail.confidence).toContain('os dados não dizem a causa')
    expect(growth).toMatchObject({ severity: 'INFORMATION', title: 'Pedicure cresce pelo segundo período consecutivo.' })
    expect(growth.detail.change).toBe('Pedicure +80% em quantidade')
    expect(growth.detail.basis).toBe('Semana S2, Semana S3 e Semana S4 (comparáveis).')
  })

  it('not enough history, and too small a base, give no trend', async () => {
    expect(kinds(await services('Semana S3'))).not.toContain('service_growth')         // S1 is the base: Pedicure 0
    expect(serviceInsights(await services('Semana S2'), money).skipped).toContainEqual({ kind: 'service_growth', reason: 'no_previous_period' })
    await as(MANAGER)
    const m4 = await services('Semana S4')
    expect(svc(m4, 'Penteado')).toMatchObject({ count: 4, previous: { count: 2 }, before_previous: { count: 1 } })   // 1 → 2 → 4: base below 5
    expect(serviceInsights(m4, money).insights.find((i) => i.kind === 'service_growth')!.title).toBe('Pedicure cresce pelo segundo período consecutivo.')
  })

  it('they join the overview insights', async () => {
    const s = await services('Semana S4')
    const h = (await dev.rpc('business_health', { p_period_id: P['Semana S4'] })).data as BusinessHealth
    const k = buildInsights(h, money, undefined, undefined, s).insights.map((i) => i.kind)
    expect(k).toEqual(expect.arrayContaining(['service_decline', 'service_concentration', 'service_growth']))
    expect(k.length).toBeLessThanOrEqual(5)
  })
})

describe('team.finance.read viewer', () => {
  it('sees every service on its own, still with no person in the response', async () => {
    await as(MANAGER)
    const s = await services('Semana S4')
    expect(s.services.map((x) => x.name)).toEqual(['Corte', 'Cor', 'Alongamento', 'Pedicure', 'Penteado', 'Manicure'])
    expect(s.other).toBeNull()
    expect(JSON.stringify(s)).not.toMatch(/Profissional|person|earned/)
  })
})
