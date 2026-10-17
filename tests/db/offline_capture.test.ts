// Offline 1 — capture-time readiness (ADR-0010 §2) and distinct inactive-reference codes (ADR-0010 §10) for
// record_service, record_advance, record_expense and record_purchase. Synthetic organizations O / P / Q from
// supabase/seeds/18_offline_capture.sql. Records go to "Teste Offline O" only (P and Q only ever see rejections), so
// the approved/closed fixtures stay empty and approvable on every run.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { A, device } from './env'

type Row = Record<string, any>                                  // eslint-disable-line @typescript-eslint/no-explicit-any
const id = (s: string) => `00000000-0000-4000-8000-0000000099${s}`
const O = {
  method: id('a0'), methodOff: id('a9'), person: id('b1'), manager: id('b2'), personOff: id('b9'), service: id('c1'), serviceOff: id('c9'),
  category: id('d1'), categoryOff: id('d9'), origin: id('e1'), originOff: id('e9'), product: id('f1'), productOff: id('f9'),
}
const P = { method: '00000000-0000-4000-8000-0000000098a0', person: '00000000-0000-4000-8000-0000000098b1', manager: '00000000-0000-4000-8000-0000000098b2', service: '00000000-0000-4000-8000-0000000098c1' }
const Q = { method: '00000000-0000-4000-8000-0000000097a0', person: '00000000-0000-4000-8000-0000000097b1', manager: '00000000-0000-4000-8000-0000000097b2', service: '00000000-0000-4000-8000-0000000097c1' }
const MIN = 60_000, H = 60 * MIN
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()
const ms = (iso: string) => new Date(iso).getTime()
const K = (kz: number) => kz * 100

let devO: SupabaseClient, devO2: SupabaseClient, devP: SupabaseClient, devQ: SupabaseClient

async function grant(c: SupabaseClient, person = O.manager, pin = '919191') {
  const r = await c.rpc('verify_person', { p_person_id: person, p_secret: pin })
  expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
  return r.data.grant_id as string
}
const service = (c: SupabaseClient, cmd: string, over: Row = {}, value = K(1000)) => c.rpc('record_service', {
  p_command_id: cmd, p_person_id: O.person, p_service_id: O.service, p_value_minor: value,
  p_payments: [{ method_id: O.method, amount_minor: value }], ...over,
})
const advance = (c: SupabaseClient, cmd: string, g: string | null, over: Row = {}) => c.rpc('record_advance', {
  p_command_id: cmd, p_grant_id: g, p_person_id: O.person, p_amount_minor: K(200), p_payment_method_id: O.method, ...over,
})
const expense = (c: SupabaseClient, cmd: string, g: string | null, over: Row = {}) => c.rpc('record_expense', {
  p_command_id: cmd, p_grant_id: g, p_category_id: O.category, p_amount_minor: K(300), p_payments: [{ method_id: O.method, amount_minor: K(300) }], ...over,
})
const purchase = (c: SupabaseClient, cmd: string, g: string | null, over: Row = {}) => c.rpc('record_purchase', {
  p_command_id: cmd, p_grant_id: g, p_lines: [{ product_id: O.product, quantity: 1, line_cost_minor: K(400) }],
  p_salon_amount_minor: K(400), p_contributions: [], p_origin_id: O.origin, ...over,
})
const summary = async (c: SupabaseClient, kind: string, rid: string) => (await c.rpc('record_summary', { p_kind: kind, p_record_id: rid })).data as Row
// The service history is not readable directly (S3b); records are observed through what the server exposes:
//   · devO2 never opens a private context, so it reads a summary of its own record only while that record's recorded_at
//     is within the last 30 minutes (record_summary, S3a): a server-side bound on recorded_at;
//   · a period's production (Fecho, devO's manager context) counts every active record of the period exactly once.
async function windowSummary(rid: string): Promise<Row> {
  const r = await devO2.rpc('record_summary', { p_kind: 'service', p_record_id: rid })
  expect(r.error, r.error?.message).toBeNull()
  return r.data
}

async function enterPrivate(c: SupabaseClient, person: string, pin: string) {
  expect((await c.rpc('verify_person', { p_person_id: person, p_secret: pin, p_scope: 'private_session' })).data?.ok).toBe(true)
}
async function periodOf(c: SupabaseClient, iso: string): Promise<Row> {
  const tz = ((await c.rpc('device_context')).data as Row).organization.timezone as string
  expect(tz).toBeTruthy()
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const p = ((await c.rpc('fecho_periods')).data as Row[]).find((x) => x.starts_on === day && x.ends_on === day)
  expect(p, `period of ${day} (seed 18)`).toBeDefined()
  return p!
}
const fecho = async (c: SupabaseClient, period: string): Promise<Row> => {
  const r = await c.rpc('fecho_period', { p_period_id: period })
  expect(r.error, r.error?.message).toBeNull()
  return r.data
}
const production = async (c: SupabaseClient, period: string) => (await fecho(c, period)).position.production.total_minor as number

beforeAll(async () => {
  devO = await device('TEST-ORG-O-2026')
  devO2 = await device('TEST-ORG-O-2026')
  devP = await device('TEST-ORG-P-2026')
  devQ = await device('TEST-ORG-Q-2026')
  await enterPrivate(devO, O.manager, '919191')
})

describe('capture time · record_service', () => {
  it('an omitted capture time behaves as before: occurred_at = recorded_at = server time', async () => {
    const cmd = randomUUID(), before = Date.now()
    const r = await service(devO2, cmd)
    expect(r.error).toBeNull()
    expect(Math.abs(ms(r.data.occurred_at) - before)).toBeLessThan(2 * MIN)               // the server clock, not the device's
    expect(ms((await windowSummary(r.data.record_id)).occurred_at)).toBe(ms(r.data.occurred_at))   // recorded_at: now, too
  })
  it('a delayed capture keeps the captured occurred_at; recorded_at is the later server write time', async () => {
    const cmd = randomUUID(), captured = at(-3 * H)
    const r = await service(devO2, cmd, { p_occurred_at: captured })
    expect(r.error).toBeNull()
    expect(ms(r.data.occurred_at)).toBe(ms(captured))
    // stored with the captured occurred_at, yet still in the recording device's 30-minute window: recorded_at is the
    // server write time, at least 2.5 hours after occurred_at
    expect(ms((await windowSummary(r.data.record_id)).occurred_at)).toBe(ms(captured))
  })
  it('48 hours is the oldest accepted capture (inclusive); older is rejected without a record', async () => {
    expect((await service(devO, randomUUID(), { p_occurred_at: at(-48 * H + 2 * MIN) })).error).toBeNull()
    const cmd = randomUUID(), tooOld = at(-48 * H - 2 * MIN)
    const period = (await periodOf(devO, tooOld)).id, p0 = await production(devO, period)
    expect((await service(devO, cmd, { p_occurred_at: tooOld })).error?.message).toBe('CAPTURE_TIME_TOO_OLD')
    expect((await service(devO, randomUUID(), { p_occurred_at: at(-30 * 24 * H) })).error?.message).toBe('CAPTURE_TIME_TOO_OLD')
    expect(await production(devO, period)).toBe(p0)                                       // nothing recorded
  })
  it('5 minutes ahead is the latest accepted capture (inclusive); later is rejected without a record', async () => {
    expect((await service(devO, randomUUID(), { p_occurred_at: at(4 * MIN) })).error).toBeNull()
    const cmd = randomUUID(), tooLate = at(6 * MIN)
    const period = (await periodOf(devO, tooLate)).id, p0 = await production(devO, period)
    expect((await service(devO, cmd, { p_occurred_at: tooLate })).error?.message).toBe('CAPTURE_TIME_IN_FUTURE')
    expect((await service(devO, randomUUID(), { p_occurred_at: at(24 * H) })).error?.message).toBe('CAPTURE_TIME_IN_FUTURE')
    expect(await production(devO, period)).toBe(p0)                                       // nothing recorded
  })
  it('a rejected capture leaves no journal entry: the same command id with a valid time is a new record', async () => {
    const cmd = randomUUID(), when = at(-H)
    const period = (await periodOf(devO, when)).id
    expect((await service(devO, cmd, { p_occurred_at: at(-49 * H) })).error?.message).toBe('CAPTURE_TIME_TOO_OLD')
    const p0 = await production(devO, period)
    const r = await service(devO, cmd, { p_occurred_at: when })
    expect(r.error).toBeNull()
    expect(r.data.replayed).toBeUndefined()
    expect(await production(devO, period)).toBe(p0 + K(1000))                             // exactly one record
  })
  it('the period is derived from occurred_at, not from the write time', async () => {
    const captured = at(-26 * H)                                           // always an earlier day than today
    const then = await periodOf(devO, captured), today = await periodOf(devO, at(0))
    expect(then.id).not.toBe(today.id)
    const [p0, t0] = [await production(devO, then.id), await production(devO, today.id)]
    expect((await service(devO, randomUUID(), { p_occurred_at: captured }, K(1234))).error).toBeNull()
    expect(await production(devO, then.id)).toBe(p0 + K(1234))
    expect(await production(devO, today.id)).toBe(t0)
  })
})

describe('capture time · idempotency', () => {
  it('same command, payload and capture time replays (one record); the same instant written differently also replays', async () => {
    const cmd = randomUUID(), captured = new Date(Date.now() - 2 * H)
    const period = (await periodOf(devO, captured.toISOString())).id, p0 = await production(devO, period)
    const first = await service(devO, cmd, { p_occurred_at: captured.toISOString() })
    expect(first.error).toBeNull()
    const again = await service(devO, cmd, { p_occurred_at: captured.toISOString() })
    expect([again.data.replayed, again.data.record_id]).toEqual([true, first.data.record_id])
    const offset = new Date(captured.getTime() + H).toISOString().replace('Z', '+01:00')   // same instant, +01:00
    expect((await service(devO, cmd, { p_occurred_at: offset })).data?.record_id).toBe(first.data.record_id)
    expect(await production(devO, period)).toBe(p0 + K(1000))                             // exactly one record
  })
  it('a different capture time, or none, under the same command id is a conflict', async () => {
    const cmd = randomUUID(), captured = at(-2 * H)
    expect((await service(devO, cmd, { p_occurred_at: captured })).error).toBeNull()
    expect((await service(devO, cmd, { p_occurred_at: at(-2 * H - 1000) })).error?.message).toBe('IDEMPOTENCY_CONFLICT')
    expect((await service(devO, cmd)).error?.message).toBe('IDEMPOTENCY_CONFLICT')
    const plain = randomUUID()
    expect((await service(devO, plain)).error).toBeNull()
    expect((await service(devO, plain, { p_occurred_at: at(-H) })).error?.message).toBe('IDEMPOTENCY_CONFLICT')
    expect((await service(devO, plain)).data.replayed).toBe(true)                          // omitted-time replay unchanged
  })
  it('the principal check is unchanged: another device cannot replay the command', async () => {
    const cmd = randomUUID(), captured = at(-H)
    expect((await service(devO, cmd, { p_occurred_at: captured })).error).toBeNull()
    expect((await service(devO2, cmd, { p_occurred_at: captured })).error?.message).toBe('IDEMPOTENCY_CONFLICT')
  })
})

describe('capture time · movements (grant at submission)', () => {
  it('advance, expense and purchase keep the captured occurred_at with a grant obtained now', async () => {
    const captured = at(-47 * H)                                           // capture time ≠ grant time
    const a = await advance(devO, randomUUID(), await grant(devO), { p_occurred_at: captured })
    const e = await expense(devO, randomUUID(), await grant(devO), { p_occurred_at: captured })
    const p = await purchase(devO, randomUUID(), await grant(devO), { p_occurred_at: captured })
    for (const r of [a, e, p]) expect(r.error, r.error?.message).toBeNull()
    for (const r of [a, e, p]) expect(ms(r.data.occurred_at)).toBe(ms(captured))
    expect(ms((await summary(devO, 'advance', a.data.advance_id)).occurred_at)).toBe(ms(captured))
    expect(ms((await summary(devO, 'expense', e.data.expense_id)).occurred_at)).toBe(ms(captured))
    expect(ms((await summary(devO, 'purchase', p.data.purchase_id)).occurred_at)).toBe(ms(captured))
    expect(a.data.confirmed_by_person_id).toBe(O.manager)                  // the person confirming at submission
  })
  it('a valid capture time does not replace the grant: none, made-up or already used are refused', async () => {
    const captured = at(-H)
    expect((await advance(devO, randomUUID(), null, { p_occurred_at: captured })).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await expense(devO, randomUUID(), randomUUID(), { p_occurred_at: captured })).error?.message).toBe('VERIFICATION_REQUIRED')
    const g = await grant(devO)
    expect((await purchase(devO, randomUUID(), g, { p_occurred_at: captured })).error).toBeNull()
    expect((await purchase(devO, randomUUID(), g, { p_occurred_at: captured })).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await advance(devO2, randomUUID(), await grant(devO), { p_occurred_at: captured })).error?.message).toBe('VERIFICATION_REQUIRED')
  })
  it('an out-of-bounds capture time is rejected before the grant is consumed', async () => {
    const g = await grant(devO)
    expect((await advance(devO, randomUUID(), g, { p_occurred_at: at(-49 * H) })).error?.message).toBe('CAPTURE_TIME_TOO_OLD')
    expect((await expense(devO, randomUUID(), g, { p_occurred_at: at(10 * MIN) })).error?.message).toBe('CAPTURE_TIME_IN_FUTURE')
    expect((await purchase(devO, randomUUID(), g, { p_occurred_at: at(-72 * H) })).error?.message).toBe('CAPTURE_TIME_TOO_OLD')
    expect((await advance(devO, randomUUID(), g, { p_occurred_at: at(-H) })).error).toBeNull()        // still unused
  })
  it('replay with the same capture time returns the original; a different one conflicts', async () => {
    const captured = at(-5 * H)
    for (const [fn, key] of [[advance, 'advance_id'], [expense, 'expense_id'], [purchase, 'purchase_id']] as const) {
      const cmd = randomUUID()
      const first = await fn(devO, cmd, await grant(devO), { p_occurred_at: captured })
      expect(first.error, key).toBeNull()
      const again = await fn(devO, cmd, null, { p_occurred_at: captured })                        // replay needs no grant
      expect([again.data?.replayed, again.data?.[key]], key).toEqual([true, first.data[key]])
      expect((await fn(devO, cmd, null, { p_occurred_at: at(-6 * H) })).error?.message, key).toBe('IDEMPOTENCY_CONFLICT')
      expect((await fn(devO, cmd, null)).error?.message, key).toBe('IDEMPOTENCY_CONFLICT')
    }
  })
})

describe('inactive references', () => {
  it('record_service: inactive person, declared operator, service or payment method each have their own code', async () => {
    expect((await service(devO, randomUUID(), { p_person_id: O.personOff })).error?.message).toBe('PERSON_INACTIVE')
    expect((await service(devO, randomUUID(), { p_declared_operator_id: O.personOff })).error?.message).toBe('PERSON_INACTIVE')
    expect((await service(devO, randomUUID(), { p_service_id: O.serviceOff })).error?.message).toBe('SERVICE_INACTIVE')
    expect((await service(devO, randomUUID(), { p_payments: [{ method_id: O.methodOff, amount_minor: K(1000) }] })).error?.message).toBe('PAYMENT_METHOD_INACTIVE')
    expect((await service(devO, randomUUID(), { p_payments: [{ method_id: O.method, amount_minor: K(500) }, { method_id: O.methodOff, amount_minor: K(500) }] })).error?.message)
      .toBe('PAYMENT_METHOD_INACTIVE')
    const cmd = randomUUID(), when = at(-H)
    const period = (await periodOf(devO, when)).id, p0 = await production(devO, period)
    expect((await service(devO, cmd, { p_service_id: O.serviceOff, p_occurred_at: when })).error?.message).toBe('SERVICE_INACTIVE')
    expect(await production(devO, period)).toBe(p0)                                       // nothing recorded
  })
  it('movements: inactive person, payment method, category, origin, product or contributor — before the grant is consumed', async () => {
    const g = await grant(devO)
    expect((await advance(devO, randomUUID(), g, { p_person_id: O.personOff })).error?.message).toBe('PERSON_INACTIVE')
    expect((await advance(devO, randomUUID(), g, { p_payment_method_id: O.methodOff })).error?.message).toBe('PAYMENT_METHOD_INACTIVE')
    expect((await advance(devO, randomUUID(), g, { p_declared_operator_id: O.personOff })).error?.message).toBe('PERSON_INACTIVE')
    expect((await expense(devO, randomUUID(), g, { p_category_id: O.categoryOff })).error?.message).toBe('CATEGORY_INACTIVE')
    expect((await expense(devO, randomUUID(), g, { p_payments: [{ method_id: O.methodOff, amount_minor: K(300) }] })).error?.message).toBe('PAYMENT_METHOD_INACTIVE')
    expect((await purchase(devO, randomUUID(), g, { p_origin_id: O.originOff })).error?.message).toBe('ORIGIN_INACTIVE')
    expect((await purchase(devO, randomUUID(), g, { p_lines: [{ product_id: O.productOff, quantity: 1, line_cost_minor: K(400) }] })).error?.message).toBe('CATALOGUE_INACTIVE')
    expect((await purchase(devO, randomUUID(), g, { p_lines: [{ new_product: { name: ' produto o desativado ', unit_word: 'unid.' }, quantity: 1, line_cost_minor: K(400) }] })).error?.message)
      .toBe('CATALOGUE_INACTIVE')
    expect((await purchase(devO, randomUUID(), g, { p_salon_amount_minor: K(300), p_contributions: [{ person_id: O.personOff, amount_minor: K(100) }] })).error?.message)
      .toBe('PERSON_INACTIVE')
    expect((await expense(devO, randomUUID(), g)).error).toBeNull()                                     // the grant was never consumed
  })
  it('another organization\'s references stay CROSS_TENANT_REFERENCE, active or not (no existence oracle)', async () => {
    const g = await grant(devP, P.manager, '929292')
    const svc = (over: Row) => devP.rpc('record_service', { p_command_id: randomUUID(), p_person_id: P.person, p_service_id: P.service, p_value_minor: K(10),
      p_payments: [{ method_id: P.method, amount_minor: K(10) }], ...over })
    for (const over of [{ p_person_id: O.personOff }, { p_person_id: O.person }, { p_person_id: randomUUID() }, { p_service_id: O.serviceOff },
      { p_declared_operator_id: O.personOff }, { p_payments: [{ method_id: O.methodOff, amount_minor: K(10) }] }]) {
      expect((await svc(over)).error?.message, JSON.stringify(over)).toBe('CROSS_TENANT_REFERENCE')
    }
    const adv = { p_command_id: randomUUID(), p_grant_id: g, p_person_id: P.person, p_amount_minor: K(10), p_payment_method_id: P.method }
    expect((await devP.rpc('record_advance', { ...adv, p_person_id: O.personOff })).error?.message).toBe('CROSS_TENANT_REFERENCE')
    expect((await devP.rpc('record_expense', { p_command_id: randomUUID(), p_grant_id: g, p_category_id: O.categoryOff, p_amount_minor: K(10),
      p_payments: [{ method_id: P.method, amount_minor: K(10) }] })).error?.message).toBe('CROSS_TENANT_REFERENCE')
    for (const over of [{ p_origin_id: O.originOff }, { p_lines: [{ product_id: O.productOff, quantity: 1, line_cost_minor: K(10) }] }]) {
      expect((await devP.rpc('record_purchase', { p_command_id: randomUUID(), p_grant_id: g, p_lines: [{ new_product: { name: 'Produto P', unit_word: 'unid.' }, quantity: 1, line_cost_minor: K(10) }],
        p_salon_amount_minor: K(10), p_contributions: [], ...over })).error?.message, JSON.stringify(over)).toBe('CROSS_TENANT_REFERENCE')
    }
    expect((await service(devO, randomUUID(), { p_person_id: A.person, p_occurred_at: at(-H) })).error?.message).toBe('CROSS_TENANT_REFERENCE')
  })
})

describe('approved and closed periods (never moved to another period)', () => {
  async function prepare(c: SupabaseClient, manager: string, pin: string, captured: string, close: boolean) {
    await enterPrivate(c, manager, pin)
    let period = await periodOf(c, captured)
    if (period.state === 'aberto') {
      const r = await c.rpc('approve_period', { p_command_id: randomUUID(), p_grant_id: await grant(c, manager, pin), p_period_id: period.id,
        p_review_revision: (await fecho(c, period.id)).review_revision })
      expect(r.error, r.error?.message).toBeNull()
    }
    if (close && (await periodOf(c, captured)).state !== 'fechado') {
      const r = await c.rpc('close_period', { p_command_id: randomUUID(), p_grant_id: await grant(c, manager, pin), p_period_id: period.id,
        p_review_revision: (await fecho(c, period.id)).review_revision })
      expect(r.error, r.error?.message).toBeNull()
    }
    period = await periodOf(c, captured)
    expect(period.state).toBe(close ? 'fechado' : 'pronto_para_pagamento')
    return period
  }
  for (const [label, c, X, pin, close, code] of [
    ['approved', () => devP, P, '929292', false, 'PERIOD_APPROVED'],
    ['closed', () => devQ, Q, '939393', true, 'PERIOD_CLOSED'],
  ] as const) {
    it(`a capture whose occurred_at falls in a ${label} period is rejected (${code}), for services and movements`, async () => {
      const captured = at(-30 * H)
      const dev = c()
      const period = await prepare(dev, X.manager, pin, captured, close)
      const today = await periodOf(dev, at(0))
      const t0 = await production(dev, today.id)
      const cmd = randomUUID()
      expect((await dev.rpc('record_service', { p_command_id: cmd, p_person_id: X.person, p_service_id: X.service, p_value_minor: K(10),
        p_payments: [{ method_id: X.method, amount_minor: K(10) }], p_occurred_at: captured })).error?.message).toBe(code)
      // nothing written in the captured period (P and Q only ever see rejections: their periods hold no service)
      expect(((await dev.rpc('team_history', { p_person_id: X.person, p_period_id: period.id, p_kind: 'service' })).data as Row).total_count).toBe(0)
      expect(await production(dev, today.id)).toBe(t0)                                                  // not moved to today
      const g = await grant(dev, X.manager, pin)
      expect((await dev.rpc('record_advance', { p_command_id: randomUUID(), p_grant_id: g, p_person_id: X.person, p_amount_minor: K(10),
        p_payment_method_id: X.method, p_occurred_at: captured })).error?.message).toBe(code)
    })
  }
})
