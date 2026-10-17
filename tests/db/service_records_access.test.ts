// S3b · service record least privilege (migration 20261017000200). Devices no longer read service_records or
// service_record_payments directly (no grant, no policy, RLS on); the operational-shared view — Hoje's summary and
// Registar serviço's people and suggestions — comes from definer functions scoped to the device's organization, with
// cancelled records excluded, unchanged signatures, shapes and limits. Unbound principals get nothing; the publishable
// key alone is refused. Records created here are cancelled again, so Teste A's open period is unaffected.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { A, B, client, device } from './env'

type Row = Record<string, any>                                  // eslint-disable-line @typescript-eslint/no-explicit-any
const CONF = { id: '00000000-0000-4000-8000-00000000a202', pin: '222222' }   // Teste A: movement.confirm + records.correct
const RUN = randomUUID().slice(0, 8)
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()
const ms = (iso: string) => new Date(iso).getTime()

const hoje = async (c: SupabaseClient, limit = 1000) => {
  const r = await c.rpc('hoje_service_summary', { p_recent_limit: limit })
  expect(r.error, r.error?.message).toBeNull()
  return r.data as Row
}
const methodCount = (h: Row, code: string) => ((h.by_method as Row[]).find((m) => m.code === code)?.count as number | undefined) ?? 0
const recentIds = (h: Row) => (h.recent as Row[]).map((x) => x.id)
const people = async (c: SupabaseClient) => {
  const r = await c.rpc('capture_people')
  expect(r.error, r.error?.message).toBeNull()
  return r.data as Row[]
}
const frequent = async (c: SupabaseClient, person: string, limit = 1000) => {
  const r = await c.rpc('frequent_services', { p_person_id: person, p_limit: limit })
  expect(r.error, r.error?.message).toBeNull()
  return r.data as Row[]
}
const uses = async (c: SupabaseClient) => ((await frequent(c, A.person)).find((s) => s.id === A.service)?.uses as number | undefined) ?? 0
const capture = async (c: SupabaseClient, value: number, payments: Row[], over: Row = {}) => {
  const cmd = randomUUID()
  const r = await c.rpc('record_service', { p_command_id: cmd, p_person_id: A.person, p_service_id: A.service, p_value_minor: value, p_payments: payments, ...over })
  expect(r.error, r.error?.message).toBeNull()
  return { cmd, id: r.data.record_id as string, occurred_at: r.data.occurred_at as string }
}
async function cancel(c: SupabaseClient, rid: string) {
  const g = await c.rpc('verify_person', { p_person_id: CONF.id, p_secret: CONF.pin })
  expect(g.data?.ok).toBe(true)
  return c.rpc('cancel_record', { p_command_id: randomUUID(), p_grant_id: g.data.grant_id, p_kind: 'service', p_record_id: rid, p_reason: `S3b ${RUN}` })
}

// Anonymous sign-ins are rate-limited on Dev (30 per hour per IP): 3 devices, plus a client with no session at all.
let pub: SupabaseClient, devA: SupabaseClient, devB: SupabaseClient, unbound: SupabaseClient
let cash: Row
const created: string[] = []
beforeAll(async () => {
  pub = client()
  devA = await device('TEST-ORG-A-2026')
  devB = await device('TEST-ORG-B-2026')
  unbound = await device(null)
  cash = (await devA.from('payment_methods').select('code, label').eq('id', A.cash).single()).data!
})
afterAll(async () => {
  for (const rid of created) {
    const r = await cancel(devA, rid)
    if (r.error && r.error.message !== 'RECORD_ALREADY_CANCELLED') throw r.error
  }
})

describe('no direct access to the service history', () => {
  it('a bound device, an unbound one and the publishable key alone cannot select either table', async () => {
    for (const c of [devA, unbound, pub]) {
      for (const t of ['service_records', 'service_record_payments']) {
        const r = await c.from(t).select('*').limit(1)
        expect(r.error?.code, t).toBe('42501')
        expect(r.data).toBeNull()
        expect((await c.from(t).select('*', { count: 'exact', head: true })).error, `${t} count`).not.toBeNull()
      }
    }
  })
  it('nor through an embedded select from a readable table', async () => {
    for (const [t, embed] of [['services', 'service_records'], ['people', 'service_records'], ['payment_methods', 'service_record_payments']]) {
      const r = await devA.from(t).select(`id, ${embed}(id)`).limit(1)
      expect(r.error, `${t} → ${embed}`).not.toBeNull()
      expect(r.data).toBeNull()
    }
  })
  it('private.is_cancelled is not reachable (schema not exposed; execute revoked)', async () => {
    const r = await devA.schema('private').rpc('is_cancelled', { p_record_id: randomUUID() })
    expect(r.error?.code).toBe('PGRST106')
  })
})

describe('Hoje: the operational-shared view, through the definer', () => {
  it('a single and a mixed capture: total, methods and recent rows with the unchanged shape; a replay counts once', async () => {
    const h0 = await hoje(devA)
    const single = await capture(devA, 123400, [{ method_id: A.cash, amount_minor: 123400 }])
    created.push(single.id)
    const replay = await devA.rpc('record_service', { p_command_id: single.cmd, p_person_id: A.person, p_service_id: A.service, p_value_minor: 123400,
      p_payments: [{ method_id: A.cash, amount_minor: 123400 }] })
    expect(replay.data).toMatchObject({ record_id: single.id, replayed: true })
    const mixed = await capture(devA, 100000, [{ method_id: A.cash, amount_minor: 60000 }, { method_id: A.transfer, amount_minor: 40000 }])
    created.push(mixed.id)
    const h1 = await hoje(devA)
    expect(h1.total).toBe(h0.total + 2)
    expect(methodCount(h1, cash.code)).toBe(methodCount(h0, cash.code) + 1)
    expect(methodCount(h1, 'mixed')).toBe(methodCount(h0, 'mixed') + 1)
    expect(ms(h1.last_at)).toBeGreaterThanOrEqual(ms(mixed.occurred_at))
    const row = (rid: string) => (h1.recent as Row[]).find((x) => x.id === rid)
    expect(Object.keys(row(single.id)!).sort()).toEqual(['id', 'method_label', 'occurred_at', 'payment_kind', 'person_name', 'service_name', 'value_minor'])
    expect(row(single.id)).toMatchObject({ person_name: 'Pessoa Teste A', payment_kind: 'single', method_label: cash.label, value_minor: 123400 })
    expect(row(mixed.id)).toMatchObject({ person_name: 'Pessoa Teste A', payment_kind: 'mixed', method_label: null, value_minor: 100000 })
    expect(ms(row(single.id)!.occurred_at)).toBe(ms(single.occurred_at))
    // another organization sees none of it
    const other = recentIds(await hoje(devB))
    expect(other).not.toContain(single.id)
    expect(other).not.toContain(mixed.id)
    // S3a is unchanged: the recording device reads the summary in its window, another organization does not
    expect((await devA.rpc('record_summary', { p_kind: 'service', p_record_id: single.id })).data).toMatchObject({ amount_minor: 123400, cancelled: null })
    expect((await devB.rpc('record_summary', { p_kind: 'service', p_record_id: single.id })).error?.message).toBe('CROSS_TENANT_REFERENCE')
  })
  it('p_recent_limit: default 4, 0 / negative / null → no rows, large → all of today; invalid values are errors', async () => {
    const all = await hoje(devA, 100000)
    expect((all.recent as Row[]).length).toBe(all.total)
    const dflt = (await devA.rpc('hoje_service_summary')).data as Row
    expect((dflt.recent as Row[]).length).toBe(Math.min(4, all.total))
    expect(dflt.total).toBe(all.total)
    for (const limit of [0, -5, null]) {
      const h = (await devA.rpc('hoje_service_summary', { p_recent_limit: limit })).data as Row
      expect(h.recent, String(limit)).toEqual([])
      expect(h.total).toBe(all.total)
    }
    expect(((await hoje(devA, 1)).recent as Row[]).length).toBe(Math.min(1, all.total))
    expect((await devA.rpc('hoje_service_summary', { p_recent_limit: 'abc' })).error).not.toBeNull()
    expect((await devA.rpc('hoje_service_summary', { p_recent_limit: 2 ** 31 })).error).not.toBeNull()
  })
})

describe('Registar serviço: people and suggestions, through the definer', () => {
  it('capture_people and frequent_services follow a capture and drop it again when it is cancelled', async () => {
    const u0 = await uses(devA)
    const h0 = await hoje(devA)
    const later = await capture(devA, 5000, [{ method_id: A.cash, amount_minor: 5000 }], { p_occurred_at: at(4 * 60_000) })   // the latest service of A
    created.push(later.id)
    const me = async () => (await people(devA)).find((p) => p.id === A.person)!
    expect(Object.keys(await me()).sort()).toEqual(['capabilities', 'display_name', 'id', 'last_service_at'])
    expect(ms((await me()).last_service_at)).toBe(ms(later.occurred_at))
    expect(await uses(devA)).toBe(u0 + 1)
    expect((await cancel(devA, later.id)).error).toBeNull()
    expect(ms((await me()).last_service_at)).toBeLessThan(ms(later.occurred_at))
    expect(await uses(devA)).toBe(u0)
    const h1 = await hoje(devA)
    expect(h1.total).toBe(h0.total)
    expect(recentIds(h1)).not.toContain(later.id)
  })
  it('the same organization only: people, services and a person id of another organization', async () => {
    const own = ((await devA.from('people').select('id')).data as Row[]).map((p) => p.id)
    const listed = (await people(devA)).map((p) => p.id)
    expect(listed).toContain(A.person)
    expect(listed.every((x) => own.includes(x))).toBe(true)
    expect((await people(devB)).map((p) => p.id)).not.toContain(A.person)
    const services = ((await devA.from('services').select('id').eq('active', true)).data as Row[]).map((s) => s.id)
    const suggested = await frequent(devA, A.person)
    expect(suggested.map((s) => s.id)).toContain(A.service)
    expect(suggested.every((s) => services.includes(s.id))).toBe(true)
    expect(Object.keys(suggested[0]).sort()).toEqual(['default_price_minor', 'id', 'name', 'uses'])
    expect(await frequent(devB, A.person)).toEqual([])                      // A's person, asked from B
    expect(await frequent(devA, B.person)).toEqual([])                      // B's person, asked from A
  })
  it('p_limit: default 5, 0 / negative / null → none, large → all; invalid values are errors', async () => {
    const all = await frequent(devA, A.person, 100000)
    expect(((await devA.rpc('frequent_services', { p_person_id: A.person })).data as Row[]).length).toBe(Math.min(5, all.length))
    for (const limit of [0, -1, null]) expect((await devA.rpc('frequent_services', { p_person_id: A.person, p_limit: limit })).data, String(limit)).toEqual([])
    expect((await frequent(devA, A.person, 1)).length).toBe(Math.min(1, all.length))
    expect((await devA.rpc('frequent_services', { p_person_id: A.person, p_limit: 'x' })).error).not.toBeNull()
    expect((await devA.rpc('frequent_services', { p_person_id: 'not-a-uuid' })).error).not.toBeNull()
  })
})

describe('unbound and anonymous callers', () => {
  it('an unbound device gets what it got before: no Hoje, no people, no suggestions', async () => {
    const h = await unbound.rpc('hoje_service_summary', {})
    expect(h.error).toBeNull()
    expect(h.data).toBeNull()
    expect(await people(unbound)).toEqual([])
    expect(await frequent(unbound, A.person)).toEqual([])
  })
  it('the publishable key alone cannot call the reads', async () => {
    expect((await pub.rpc('hoje_service_summary', {})).error?.code).toBe('42501')
    expect((await pub.rpc('capture_people')).error?.code).toBe('42501')
    expect((await pub.rpc('frequent_services', { p_person_id: A.person })).error?.code).toBe('42501')
  })
})
