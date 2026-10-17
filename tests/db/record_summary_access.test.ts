// S3a · record_summary least privilege (migration 20261017000100). A summary is returned only to the device that recorded
// the record, for 30 minutes after its server write time (recorded_at), or to a verified private context of an active
// team.finance.read holder; anything else gets CROSS_TENANT_REFERENCE, exactly like an unknown id. A record's recorded_at
// cannot be moved from here: the 30-minute boundary and the lapsed window are proved by the migration's self-test
// (private.record_summary_allowed: 29:59 and 30:00 allowed, 30:00.000001 and later denied).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { A, device } from './env'

type Row = Record<string, any>                                  // eslint-disable-line @typescript-eslint/no-explicit-any
const id = (s: string) => `00000000-0000-4000-8000-00000000${s}`
const K = (kz: number) => kz * 100
// Teste A (seeds 01, 02, 05, 09): a201 the beneficiary, no permission · a202 movement.confirm + records.correct, no
// team.finance.read · a205 team.finance.read only
const OWNER = { id: A.person, pin: '111111' }, CONF = { id: id('a202'), pin: '222222' }, MANAGER = { id: id('a205'), pin: '666666' }
const KINDS = ['service', 'advance', 'expense', 'purchase'] as const
type Kind = typeof KINDS[number]
const DENIED = 'CROSS_TENANT_REFERENCE'
const RUN = randomUUID().slice(0, 8)                            // this run's cancellation reasons

const summary = (c: SupabaseClient, kind: string, rid: string) => c.rpc('record_summary', { p_kind: kind, p_record_id: rid })
async function grant(c: SupabaseClient) {
  const r = await c.rpc('verify_person', { p_person_id: CONF.id, p_secret: CONF.pin })
  expect(r.data?.ok).toBe(true)
  return r.data.grant_id as string
}
async function privateAs(c: SupabaseClient, who: { id: string; pin: string }) {
  const r = await c.rpc('verify_person', { p_person_id: who.id, p_secret: who.pin, p_scope: 'private_session' })
  expect(r.data?.ok).toBe(true)
}
const service = (c: SupabaseClient, cmd: string, over: Row = {}) => c.rpc('record_service', {
  p_command_id: cmd, p_person_id: A.person, p_service_id: A.service, p_value_minor: K(4321),
  p_payments: [{ method_id: A.cash, amount_minor: K(4321) }], ...over,
})
const cancel = async (c: SupabaseClient, kind: Kind, rid: string, reason: string) =>
  c.rpc('cancel_record', { p_command_id: randomUUID(), p_grant_id: await grant(c), p_kind: kind, p_record_id: rid, p_reason: reason })

// Anonymous sign-ins are rate-limited on Dev (30 per hour per IP): 4 devices.
//   rec     — records one record of each kind (and the delayed capture) and reads them back at once
//   other   — a second device of the same salon: first without a PIN, then private contexts (each test ends its own)
//   devB    — another organization · unbound — no organization
let rec: SupabaseClient, other: SupabaseClient, devB: SupabaseClient, unbound: SupabaseClient
const ids = {} as Record<Kind, string>
const toCancel: [Kind, string][] = []
beforeAll(async () => {
  rec = await device('TEST-ORG-A-2026')
  other = await device('TEST-ORG-A-2026')
  devB = await device('TEST-ORG-B-2026')
  unbound = await device(null)
  const s = await service(rec, randomUUID())
  const a = await rec.rpc('record_advance', { p_command_id: randomUUID(), p_grant_id: await grant(rec), p_person_id: A.person,
    p_amount_minor: K(321), p_payment_method_id: A.cash })
  const e = await rec.rpc('record_expense', { p_command_id: randomUUID(), p_grant_id: await grant(rec), p_category_id: id('a401'),
    p_amount_minor: K(432), p_payments: [{ method_id: A.cash, amount_minor: K(432) }] })
  const p = await rec.rpc('record_purchase', { p_command_id: randomUUID(), p_grant_id: await grant(rec),
    p_lines: [{ product_id: id('a601'), quantity: 1, line_cost_minor: K(543) }], p_salon_amount_minor: K(543), p_contributions: [], p_origin_id: id('a501') })
  for (const r of [s, a, e, p]) expect(r.error, r.error?.message).toBeNull()
  Object.assign(ids, { service: s.data.record_id, advance: a.data.advance_id, expense: e.data.expense_id, purchase: p.data.purchase_id })
  for (const k of KINDS) toCancel.push([k, ids[k]])
})
// Nothing created here keeps counting in Teste A's open period: whatever a test did not cancel is cancelled now.
afterAll(async () => {
  for (const [k, rid] of toCancel) {
    const r = await cancel(rec, k, rid, `S3a limpeza ${RUN}`)
    if (r.error && r.error.message !== 'RECORD_ALREADY_CANCELLED') throw r.error
  }
})

describe('the recording device, right after capture', () => {
  it('reads every kind, with the unchanged response shape', async () => {
    const want: Record<Kind, number> = { service: K(4321), advance: K(321), expense: K(432), purchase: K(543) }
    for (const k of KINDS) {
      const r = await summary(rec, k, ids[k])
      expect(r.error, `${k}: ${r.error?.message}`).toBeNull()
      expect(Object.keys(r.data).sort()).toEqual(
        ['amount_minor', 'cancelled', 'kind', 'occurred_at', 'person', 'title', ...(k === 'purchase' ? ['line_count'] : [])].sort())
      expect(r.data).toMatchObject({ kind: k, amount_minor: want[k], cancelled: null })
    }
    expect((await summary(rec, 'advance', ids.advance)).data).toMatchObject({ title: 'Adiantamento', person: 'Pessoa Teste A' })
    expect((await summary(rec, 'expense', ids.expense)).data).toMatchObject({ title: 'Despesa Teste A', person: null })
    expect((await summary(rec, 'purchase', ids.purchase)).data).toMatchObject({ title: 'Compra · Mercado', person: null, line_count: 1 })
  })
  it('a wrong kind, an unknown id or an unknown kind is the not-found answer, even inside the window', async () => {
    expect((await summary(rec, 'expense', ids.advance)).error?.message).toBe(DENIED)
    expect((await summary(rec, 'advance', randomUUID())).error?.message).toBe(DENIED)
    expect((await summary(rec, 'payment', ids.service)).error?.message).toBe(DENIED)
  })
})

describe('another device of the same salon', () => {
  it('without a private context reads nothing, with the same answer as an unknown id', async () => {
    expect((await other.rpc('private_context_status')).data).toEqual({ active: false })
    for (const k of KINDS) {
      const r = await summary(other, k, ids[k])
      expect(r.data, k).toBeNull()
      expect(r.error?.message, k).toBe(DENIED)
    }
    expect((await summary(other, 'advance', randomUUID())).error?.message).toBe(DENIED)
  })
  it('a team.finance.read holder\'s private context reads every kind, exactly as the recording device does', async () => {
    await privateAs(other, MANAGER)
    try {
      for (const k of KINDS) {
        const r = await summary(other, k, ids[k])
        expect(r.error, `${k}: ${r.error?.message}`).toBeNull()
        expect(r.data).toEqual((await summary(rec, k, ids[k])).data)
      }
    } finally { await other.rpc('end_private_context') }
    expect((await summary(other, 'advance', ids.advance)).error?.message).toBe(DENIED)   // ended: the access ends with it
  })
  it('records.correct without team.finance.read reads nothing', async () => {
    await privateAs(other, CONF)
    try {
      expect((await other.rpc('private_context_status')).data).toMatchObject({ active: true, person_id: CONF.id, view: 'self' })
      for (const k of KINDS) expect((await summary(other, k, ids[k])).error?.message, k).toBe(DENIED)
    } finally { await other.rpc('end_private_context') }
  })
  it('the person\'s own records in their own private context: the B3 view lists them, the summary stays closed', async () => {
    await privateAs(other, OWNER)
    try {
      const own = await other.rpc('team_history', { p_person_id: OWNER.id })
      expect(own.error).toBeNull()
      const listed = ((own.data as Row).rows as Row[]).map((r) => r.record_id)
      expect(listed).toEqual(expect.arrayContaining([ids.service, ids.advance]))
      expect((await summary(other, 'service', ids.service)).error?.message).toBe(DENIED)
      expect((await summary(other, 'advance', ids.advance)).error?.message).toBe(DENIED)
    } finally { await other.rpc('end_private_context') }
  })
})

describe('organization isolation', () => {
  it('another organization\'s device gets the not-found answer; an unbound principal NOT_AUTHORIZED', async () => {
    for (const k of KINDS) {
      expect((await summary(devB, k, ids[k])).error?.message, k).toBe(DENIED)
      expect((await summary(unbound, k, ids[k])).error?.message, k).toBe('NOT_AUTHORIZED')
    }
  })
})

describe('offline-delayed capture and replay', () => {
  it('the window opens at recorded_at, not at the captured time; a replay keeps the same record and access', async () => {
    const captured = new Date(Date.now() - 45 * 60_000).toISOString()          // captured offline 45 minutes ago
    const cmd = randomUUID()
    const first = await service(rec, cmd, { p_occurred_at: captured })
    expect(first.error, first.error?.message).toBeNull()
    const rid = first.data.record_id as string
    toCancel.push(['service', rid])
    const s = await summary(rec, 'service', rid)
    expect(s.error, s.error?.message).toBeNull()
    expect(new Date(s.data.occurred_at).getTime()).toBe(new Date(captured).getTime())
    const again = await service(rec, cmd, { p_occurred_at: captured })
    expect(again.data).toMatchObject({ record_id: rid, replayed: true })
    expect((await summary(rec, 'service', rid)).data).toEqual(s.data)
    expect((await summary(other, 'service', rid)).error?.message).toBe(DENIED)
  })
})

describe('cancellations and the Fecho history', () => {
  it('a cancellation on the recording device: its summary shows who and why; the Fecho history still lists every kind', async () => {
    const reason = (k: Kind) => `S3a ${k} ${RUN}`
    for (const k of KINDS) {
      const r = await cancel(rec, k, ids[k], reason(k))
      expect(r.error, `${k}: ${r.error?.message}`).toBeNull()
      expect((await summary(rec, k, ids[k])).data.cancelled).toMatchObject({ reason: reason(k), by: 'Confirmador Teste A' })
    }
    expect((await summary(other, 'advance', ids.advance)).error?.message).toBe(DENIED)  // the reason stays private
    await privateAs(other, MANAGER)
    try {
      const h = await other.rpc('fecho_history', {})
      expect(h.error, h.error?.message).toBeNull()
      for (const k of KINDS) {
        expect((h.data as Row[]).find((x) => x.kind === 'cancellation' && x.reason === reason(k)), k)
          .toMatchObject({ record_kind: k, by: 'Confirmador Teste A', record: { kind: k } })
      }
    } finally { await other.rpc('end_private_context') }
  })
})
