// Slice 3 · identity selectors by purpose and the support identity, from an operational device (the support-device view
// and the operator procedure are in tests/sql/person_kind_probe.sql). Synthetic "Teste Pessoas" (seed 22).
// A list is a convenience: the server still checks every permission, whoever is or is not listed.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { client, device } from './env'

type Row = { id: string; display_name: string }
const id = (n: string) => `00000000-0000-4000-8000-00000000fb${n}`
const P = {
  gestor: id('b1'), gestora: id('b2'), profA: id('b3'), profB: id('b4'), semPin: id('b5'), suporte: id('b6'), leitora: id('b7'), inativo: id('b8'),
}
const PIN: Record<string, string> = { [P.gestor]: '141414', [P.gestora]: '151515', [P.profA]: '161616', [P.suporte]: '181818', [P.leitora]: '191919' }
const CODE = 'TEST-ORG-PESSOAS-2026'
const SERVICE = id('d1'), PRODUCT = id('e1'), CASH = id('a0')
let d: SupabaseClient

const ids = (rows: Row[] | null) => (rows ?? []).map((r) => r.id).sort()
const sorted = (...xs: string[]) => [...xs].sort()
async function listed(purpose?: string) {
  const r = await d.rpc('list_private_people', purpose === undefined ? {} : { p_purpose: purpose })
  expect(r.error, r.error?.message).toBeNull()
  return ids(r.data as Row[])
}
async function confirmers(permission: string) {
  const r = await d.rpc('list_confirmers', { p_permission: permission })
  expect(r.error, r.error?.message).toBeNull()
  return ids(r.data as Row[])
}
async function enter(person: string) {
  const r = await d.rpc('verify_person', { p_person_id: person, p_secret: PIN[person], p_scope: 'private_session' })
  expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
}
const errorOf = async (fn: string) => (await d.rpc(fn)).error?.message ?? null

beforeAll(async () => { d = await device(CODE) })
afterAll(async () => { await d.rpc('end_private_context') })

describe('the private entry lists people by purpose (the server decides)', () => {
  it('private area: every active personnel with a PIN, as before — professionals open their own situation', async () => {
    const all = sorted(P.gestor, P.gestora, P.profA, P.profB, P.leitora)
    expect(await listed()).toEqual(all)                                       // no purpose: the private area, as before
    expect(await listed('private')).toEqual(all)
  })
  it('Fecho: holders of team.finance.read only — the two managers', async () => {
    expect(await listed('fecho')).toEqual(sorted(P.gestor, P.gestora))
  })
  it('Negócio: holders of business.health.read only', async () => {
    expect(await listed('negocio')).toEqual(sorted(P.gestor, P.gestora, P.leitora))
  })
  it('never the support identity, an inactive person or someone without a PIN', async () => {
    for (const purpose of ['private', 'fecho', 'negocio']) {
      const xs = await listed(purpose)
      for (const x of [P.suporte, P.inativo, P.semPin]) expect(xs, `${purpose} ${x}`).not.toContain(x)
    }
  })
  it('an unknown purpose is refused; another organization\'s people never appear', async () => {
    for (const bad of ['outro', null]) expect((await d.rpc('list_private_people', { p_purpose: bad })).error?.message).toBe('VALIDATION_FAILED')
    const a = await device('TEST-ORG-A-2026')
    const r = await a.rpc('list_private_people', { p_purpose: 'private' })
    expect(r.error).toBeNull()
    expect((r.data as Row[]).some((x) => x.id.includes('fbb'))).toBe(false)
  })
  it('the publishable key alone cannot list anyone', async () => {
    expect((await client().rpc('list_private_people', { p_purpose: 'fecho' })).error?.code).toBe('42501')
  })
})

describe('confirmers, workers and contributors exclude the support identity', () => {
  it('each confirmation list is its permission holders among personnel', async () => {
    expect(await confirmers('period.decide')).toEqual(sorted(P.gestor, P.gestora))
    expect(await confirmers('period.close')).toEqual(sorted(P.gestor, P.gestora))
    expect(await confirmers('payment.confirm')).toEqual([P.gestora])
    for (const p of ['movement.confirm', 'period.reopen', 'records.correct', 'catalogue.manage']) expect(await confirmers(p), p).toEqual([P.gestor])
  })
  it('service capture and advances: people with service capabilities, personnel only', async () => {
    const r = await d.rpc('capture_people')
    expect(r.error).toBeNull()
    expect(ids(r.data as Row[])).toEqual(sorted(P.gestor, P.profA, P.profB, P.semPin))
  })
  it('purchase contributors: active personnel; the support row stays readable for names already recorded', async () => {
    const r = await d.from('people').select('id').eq('active', true).eq('kind', 'personnel')
    expect(r.error).toBeNull()
    expect(ids(r.data as Row[])).not.toContain(P.suporte)
    const s = await d.from('people').select('id, display_name, kind').eq('id', P.suporte).single()
    expect(s.data).toEqual({ id: P.suporte, display_name: 'Suporte Pessoas', kind: 'support' })
  })
  it('a device cannot change a person\'s kind', async () => {
    const u = await d.from('people').update({ kind: 'personnel' }).eq('id', P.suporte).select()
    expect(u.error?.code).toBe('42501')                                     // no update privilege on people
    expect((await d.from('people').select('kind').eq('id', P.suporte).single()).data?.kind).toBe('support')
  })
})

describe('permissions are unchanged by any list', () => {
  it('the managers open Fecho and Negócio', async () => {
    for (const p of [P.gestor, P.gestora]) {
      await enter(p)
      expect(await errorOf('fecho_periods'), p).toBeNull()
      expect(await errorOf('business_health'), p).toBeNull()
    }
  })
  it('a professional is refused Fecho and Negócio by the server; the Negócio reader only Fecho', async () => {
    await enter(P.profA)
    expect(await errorOf('fecho_periods')).toBe('NOT_AUTHORIZED')
    expect(await errorOf('business_health')).toBe('NOT_AUTHORIZED')
    await enter(P.leitora)
    expect(await errorOf('fecho_periods')).toBe('NOT_AUTHORIZED')
    expect(await errorOf('business_health')).toBeNull()
  })
  it('the support identity keeps its scoped permissions: not listed here, but its PIN and permissions still work', async () => {
    await enter(P.suporte)
    expect(await errorOf('fecho_periods')).toBeNull()
    expect(await errorOf('business_health')).toBeNull()
    const s = (await d.rpc('private_context_status')).data
    expect(s).toMatchObject({ active: true, person_id: P.suporte, view: 'manager', business_health: true })
  })
})

describe('operational attribution is personnel only, enforced by the server (whatever the client sends)', () => {
  const grant = async (person: string) => {
    const r = await d.rpc('verify_person', { p_person_id: person, p_secret: PIN[person] })
    expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
    return r.data.grant_id as string
  }
  const advance = (g: string, person: string, at?: string) => d.rpc('record_advance', { p_command_id: randomUUID(), p_grant_id: g, p_person_id: person,
    p_amount_minor: 5000, p_payment_method_id: CASH, ...(at ? { p_occurred_at: at } : {}) })
  const purchase = (g: string, contributors: { person_id: string; amount_minor: number }[]) => d.rpc('record_purchase', { p_command_id: randomUUID(), p_grant_id: g,
    p_lines: [{ product_id: PRODUCT, quantity: 1, line_cost_minor: 10000 }], p_salon_amount_minor: 10000 - contributors.reduce((t, c) => t + c.amount_minor, 0),
    p_contributions: contributors })
  const service = (person: string) => d.rpc('record_service', { p_command_id: randomUUID(), p_person_id: person, p_service_id: SERVICE, p_value_minor: 100000,
    p_payments: [{ method_id: CASH, amount_minor: 100000 }] })
  const tenMinutesAgo = () => new Date(Date.now() - 600_000).toISOString()

  it('an advance to the support identity is refused — online and dated (an offline draft) — without consuming the grant', async () => {
    const g = await grant(P.gestor)
    expect((await advance(g, P.suporte)).error?.message).toBe('PERSON_NOT_PERSONNEL')
    expect((await advance(g, P.suporte, tenMinutesAgo())).error?.message).toBe('PERSON_NOT_PERSONNEL')
    const ok = await advance(g, P.profA)                                        // the same grant: nothing was consumed
    expect(ok.error, ok.error?.message).toBeNull()
    expect(ok.data.confirmed_by_person_id).toBe(P.gestor)
  })
  it('the support identity as a purchase contributor is refused, alone or beside personnel, without consuming the grant', async () => {
    const g = await grant(P.gestor)
    expect((await purchase(g, [{ person_id: P.suporte, amount_minor: 2000 }])).error?.message).toBe('PERSON_NOT_PERSONNEL')
    expect((await purchase(g, [{ person_id: P.gestora, amount_minor: 2000 }, { person_id: P.suporte, amount_minor: 1000 }])).error?.message).toBe('PERSON_NOT_PERSONNEL')
    const ok = await purchase(g, [{ person_id: P.gestora, amount_minor: 2000 }])  // personnel contributor (no service capability needed)
    expect(ok.error, ok.error?.message).toBeNull()
    expect(ok.data.contributors).toEqual([{ person_id: P.gestora, display_name: 'Gestora Pessoas', amount_minor: 2000 }])
  })
  it('a service by the support identity is refused; by a professional, accepted as before', async () => {
    expect((await service(P.suporte)).error?.message).toBe('PERSON_NOT_PERSONNEL')
    const ok = await service(P.profA)
    expect(ok.error, ok.error?.message).toBeNull()
  })
  it('the support identity still confirms what its permissions allow (the verified actor is not the person recorded)', async () => {
    const ok = await advance(await grant(P.suporte), P.profB)
    expect(ok.error, ok.error?.message).toBeNull()
    expect(ok.data.confirmed_by_person_id).toBe(P.suporte)
  })
})
