// Offline 8 · period boundaries (ADR-0010 §2, §5) on the synthetic "Teste Offline Sync" (seed 19): the captured
// occurred_at decides the period a delayed record belongs to (the end is exclusive, in the organization's time zone),
// the server's receipt time decides whether a device report counts after a period's end, and nothing is moved.
// Uses the period of the organization's previous day (ended less than 24 h ago, so within the 48-hour capture window)
// and of today; neither is approved here. Every device made offline-capable ends with a zero report.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { device } from './env'

type Row = Record<string, any>                                  // eslint-disable-line @typescript-eslint/no-explicit-any
const id = (s: string) => `00000000-0000-4000-8000-0000000096${s}`
const S = { method: id('a0'), person: id('b1'), manager: id('b2'), service: id('c1') }
const PIN = '969696', CODE = 'TEST-ORG-SYNC-2026'
const zero = { days: [], undated: {} }
const made: SupabaseClient[] = []
let mgr: SupabaseClient, tz: string
let yesterday: Row, today: Row, end: number                             // end: the instant yesterday's period ended

const dayIn = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
/** The start of `day` (YYYY-MM-DD) in the organization's time zone, as an instant. */
function startOf(day: string): number {
  const guess = Date.parse(`${day}T00:00:00Z`)
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(guess)).find((p) => p.type === 'timeZoneName')!.value
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  return m ? guess - (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000 : guess
}
async function newDevice() { const c = await device(CODE); made.push(c); return c }
const report = (c: SupabaseClient, r: unknown) => c.rpc('report_device_sync', { p_report: r })
const status = async (period: string) => (await mgr.rpc('fecho_sync_status', { p_period_id: period })).data as Row
const revision = async (period: string) => ((await mgr.rpc('fecho_period', { p_period_id: period })).data as Row).review_revision as number
const service = (c: SupabaseClient, occurredAt: string) => c.rpc('record_service', {
  p_command_id: randomUUID(), p_person_id: S.person, p_service_id: S.service, p_value_minor: 100000,
  p_payments: [{ method_id: S.method, amount_minor: 100000 }], p_occurred_at: occurredAt,
})
async function grant() {
  const r = await mgr.rpc('verify_person', { p_person_id: S.manager, p_secret: PIN })
  expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
  return r.data.grant_id as string
}

beforeAll(async () => {
  mgr = await newDevice()
  expect((await mgr.rpc('verify_person', { p_person_id: S.manager, p_secret: PIN, p_scope: 'private_session' })).data?.ok).toBe(true)
  tz = ((await mgr.rpc('device_context')).data as Row).organization.timezone
  const periods = (await mgr.rpc('fecho_periods')).data as Row[]
  const todayDay = dayIn(Date.now())
  end = startOf(todayDay)
  const yDay = dayIn(end - 1)
  today = periods.find((p) => p.starts_on === todayDay && p.ends_on === todayDay)!
  yesterday = periods.find((p) => p.starts_on === yDay && p.ends_on === yDay)!
  expect([yesterday?.state, today?.state], 'seed 19 daily periods, still open').toEqual(['aberto', 'aberto'])
  expect(Date.now() - end).toBeLessThan(24 * 3600_000)
  expect((await report(mgr, zero)).error).toBeNull()
})
afterAll(async () => { for (const c of made) await report(c, zero) })

describe('a delayed record belongs to the period of its captured time', () => {
  it('captured one second before the end, sent after it: the ended period — not today\'s', async () => {
    const [y0, t0] = [await revision(yesterday.id), await revision(today.id)]
    const captured = new Date(end - 1000).toISOString()
    const r = await service(mgr, captured)
    expect(r.error, r.error?.message).toBeNull()
    expect(new Date(r.data.occurred_at).getTime()).toBe(end - 1000)          // never rewritten to the write time
    expect([await revision(yesterday.id) > y0, await revision(today.id)]).toEqual([true, t0])
  })
  it('captured exactly at the end: the next period (the end is exclusive)', async () => {
    const [y0, t0] = [await revision(yesterday.id), await revision(today.id)]
    expect((await service(mgr, new Date(end).toISOString())).error).toBeNull()
    expect([await revision(yesterday.id), await revision(today.id) > t0]).toEqual([y0, true])
  })
  it('a movement draft captured before the end and confirmed after it with a fresh PIN: the ended period', async () => {
    const [y0, t0] = [await revision(yesterday.id), await revision(today.id)]
    const r = await mgr.rpc('record_advance', { p_command_id: randomUUID(), p_grant_id: await grant(), p_person_id: S.person, p_amount_minor: 5000,
      p_payment_method_id: S.method, p_occurred_at: new Date(end - 60_000).toISOString() })
    expect(r.error, r.error?.message).toBeNull()
    expect([await revision(yesterday.id) > y0, await revision(today.id)]).toEqual([true, t0])
  })
})

describe('reports around the end', () => {
  it('the server\'s receipt time qualifies a report; a time the device sends is ignored', async () => {
    const d = await newDevice()
    const [y0, t0] = [await status(yesterday.id), await status(today.id)]
    const r = await report(d, { ...zero, reported_at: '2000-01-01T00:00:00Z' })
    expect(r.error).toBeNull()
    expect(Date.parse(r.data.reported_at)).toBeGreaterThan(end)
    expect(await status(yesterday.id)).toMatchObject({ ready: y0.ready + 1, silent: y0.silent })   // after the end: it counts
    expect(await status(today.id)).toMatchObject({ ready: t0.ready, silent: t0.silent + 1 })       // before today's end: it cannot yet
  })
  it('two phones crossing the end: the one still holding work for the ended period blocks it until it sends and reports', async () => {
    const a = await newDevice(), b = await newDevice()
    const base = await status(yesterday.id)
    await report(a, zero)
    await report(b, { days: [{ day: yesterday.starts_on, services: 1 }], undated: {} })       // b captured before the end, offline
    expect(await status(yesterday.id)).toMatchObject({ ready: base.ready + 1, pending: base.pending + 1, safe: false })
    expect((await service(b, new Date(end - 30_000).toISOString())).error).toBeNull()          // b reconnects: the service lands in its period
    await report(b, zero)
    expect(await status(yesterday.id)).toMatchObject({ ready: base.ready + 2, pending: base.pending })
  })
  it('work captured after the end never holds back the ended period', async () => {
    const d = await newDevice()
    const base = await status(yesterday.id)
    await report(d, { days: [{ day: today.starts_on, services: 1 }], undated: {} })
    expect(await status(yesterday.id)).toMatchObject({ ready: base.ready + 1, pending: base.pending })
    expect((await status(today.id)).safe).toBe(false)
  })
})
