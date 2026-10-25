// Offline 7 · multi-device period sync safety (ADR-0010 §5). Synthetic "Teste Offline Sync" (seed 19). Every device
// this file makes offline-capable ends the run with a zero report, so later runs are not blocked by it.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { B, client, device } from './env'

type Row = Record<string, any>                                  // eslint-disable-line @typescript-eslint/no-explicit-any
const MANAGER = '00000000-0000-4000-8000-0000000096b2', PIN = '969696'
const CODE = 'TEST-ORG-SYNC-2026'
const zero = { days: [], undated: {} }
const made: SupabaseClient[] = []
let mgr: SupabaseClient

async function newDevice() { const c = await device(CODE); made.push(c); return c }
const report = (c: SupabaseClient, r: unknown) => c.rpc('report_device_sync', { p_report: r })
async function ok(c: SupabaseClient, r: unknown) { const x = await report(c, r); expect(x.error, x.error?.message).toBeNull(); return x.data }
async function grant(c = mgr) {
  const r = await c.rpc('verify_person', { p_person_id: MANAGER, p_secret: PIN })
  expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
  return r.data.grant_id as string
}
const status = async (period: string) => { const r = await mgr.rpc('fecho_sync_status', { p_period_id: period }); expect(r.error, r.error?.message).toBeNull(); return r.data as Row }
const revision = async (period: string) => ((await mgr.rpc('fecho_period', { p_period_id: period })).data as Row).review_revision as number
const approve = async (period: string, g?: string) => mgr.rpc('approve_period', { p_command_id: randomUUID(), p_grant_id: g ?? await grant(), p_period_id: period, p_review_revision: await revision(period) })
const close = async (period: string, g?: string) => mgr.rpc('close_period', { p_command_id: randomUUID(), p_grant_id: g ?? await grant(), p_period_id: period, p_review_revision: await revision(period) })
const used = new Set<string>()
let pool: Row[] = []
/** An unused, already-ended, still open period of the pool, and its day. */
function freshPeriod(): { id: string; day: string } {
  const p = pool.find((x) => !used.has(x.id))
  if (!p) throw new Error('no ended open "Sync" period left: add more to seed 19')
  used.add(p.id)
  return { id: p.id, day: p.starts_on }
}
const pendingOn = (day: string, kind: 'services' | 'drafts' | 'conflicts') => ({ days: [{ day, [kind]: 1 }], undated: {} })

beforeAll(async () => {
  mgr = await newDevice()
  expect((await mgr.rpc('verify_person', { p_person_id: MANAGER, p_secret: PIN, p_scope: 'private_session' })).data?.ok).toBe(true)
  pool = ((await mgr.rpc('fecho_periods')).data as Row[])
    .filter((p) => p.label.startsWith('Sync 2025') && p.state === 'aberto').sort((a, b) => (a.starts_on < b.starts_on ? -1 : 1))
  await ok(mgr, zero)                                                       // the manager's own device: offline-capable, nothing pending
})
afterAll(async () => { for (const c of made) await report(c, zero) })

describe('device registration and report', () => {
  it('a bound device becomes offline-capable with its first report, scoped to its own organization', async () => {
    const p = freshPeriod()
    const before = await status(p.id)
    const d = await newDevice()
    const r = await ok(d, { ...zero, organization_id: B.org, device_id: randomUUID() })      // client-supplied ids are ignored
    expect(r.reported_at).toMatch(/^\d{4}-/)
    expect(await status(p.id)).toMatchObject({ ready: before.ready + 1, safe: true })
  })
  it('an unbound principal or the publishable key alone cannot report', async () => {
    expect((await report(await device(null), zero)).error?.message).toBe('NOT_AUTHORIZED')
    expect((await report(client(), zero)).error?.code).toBe('42501')
  })
  it('malformed reports are refused', async () => {
    const d = await newDevice()
    for (const bad of [null, [], { days: 'x' }, { days: [{ day: '2025-1-1', services: 1 }] }, { days: [{ day: '2025-01-01', services: -1 }] },
      { days: [{ day: '2025-01-01', services: 1.5 }] }, { days: [], undated: { conflicts: 'many' } },
      { days: Array.from({ length: 401 }, () => ({ day: '2025-01-01', services: 1 })) }]) {
      expect((await report(d, bad)).error?.message, JSON.stringify(bad)?.slice(0, 60)).toBe('VALIDATION_FAILED')
    }
  })
  it('another organization\'s devices never count here, and its periods are not readable', async () => {
    const p = freshPeriod()
    const before = await status(p.id)
    await ok(await device('TEST-ORG-B-2026'), pendingOn(p.day, 'services'))
    expect(await status(p.id)).toEqual(before)
    expect((await mgr.rpc('fecho_sync_status', { p_period_id: '00000000-0000-4000-8000-0000000cb801' })).error?.message).toBe('CROSS_TENANT_REFERENCE')
  })
  it('the status: the counts and the devices behind them (label, state, counts — never an id); needs a team-finance private context', async () => {
    const p = freshPeriod()
    const s = await status(p.id)
    expect(Object.keys(s).sort()).toEqual(['devices', 'pending', 'period_ended', 'ready', 'safe', 'silent'])
    for (const d of s.devices as Row[]) {
      expect(Object.keys(d).sort()).toEqual(['conflicts', 'drafts', 'enrolled_at', 'label', 'reported_at', 'services', 'state', 'this_device'])
    }
    expect(JSON.stringify(s)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/)
    const plain = await newDevice()
    await ok(plain, zero)
    expect((await plain.rpc('fecho_sync_status', { p_period_id: p.id })).error?.message).toBe('VERIFICATION_REQUIRED')
  })
})

describe('period sync safety', () => {
  it('organizations without offline-capable devices are unchanged (Teste Fecho C)', async () => {
    const c = await device('TEST-ORG-C-2026')
    expect((await c.rpc('verify_person', { p_person_id: '00000000-0000-4000-8000-00000000c202', p_secret: '343434', p_scope: 'private_session' })).data?.ok).toBe(true)
    const any = ((await c.rpc('fecho_periods')).data as Row[])[0]!
    expect((await c.rpc('fecho_sync_status', { p_period_id: any.id })).data)
      .toEqual({ ready: 0, pending: 0, silent: 0, safe: true, period_ended: expect.any(Boolean), devices: [] })
  })
  it('every offline-capable device ready after the period ended: approve and close proceed', async () => {
    const p = freshPeriod()
    expect(await status(p.id)).toMatchObject({ pending: 0, silent: 0, safe: true })             // the revoked seed device does not count
    expect((await approve(p.id)).error).toBeNull()
    expect((await close(p.id)).error).toBeNull()
  })
  it('the current day\'s period: no device has reported after its end — blocked', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Luanda', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const p = ((await mgr.rpc('fecho_periods')).data as Row[]).find((x) => x.starts_on === today)!
    expect(await status(p.id)).toMatchObject({ safe: false })
    expect((await status(p.id)).silent).toBeGreaterThan(0)
    expect((await approve(p.id)).error?.message).toBe('PERIOD_OFFLINE_SYNC_PENDING')
  })
  it.each(['services', 'drafts', 'conflicts'] as const)('pending %s on the period\'s day blocks it; a zero report unblocks', async (kind) => {
    const p = freshPeriod()
    const d = await newDevice()
    await ok(d, pendingOn(p.day, kind))
    expect(await status(p.id)).toMatchObject({ pending: 1, safe: false })
    expect((await approve(p.id)).error?.message).toBe('PERIOD_OFFLINE_SYNC_PENDING')
    await ok(d, zero)
    expect((await approve(p.id)).error).toBeNull()
  })
  it('work on another day does not block this period; undated work blocks every period', async () => {
    const p = freshPeriod(), other = freshPeriod()
    const d = await newDevice()
    await ok(d, pendingOn(other.day, 'services'))
    expect((await status(p.id)).safe).toBe(true)
    await ok(d, { days: [], undated: { drafts: 1 } })
    expect((await status(p.id)).safe).toBe(false)
    expect((await status(other.id)).safe).toBe(false)
    await ok(d, zero)
  })
  it('several devices: all must be ready', async () => {
    const p = freshPeriod()
    const a = await newDevice(), b = await newDevice()
    await ok(a, zero)
    await ok(b, pendingOn(p.day, 'conflicts'))
    expect(await status(p.id)).toMatchObject({ pending: 1, safe: false })
    await ok(b, zero)
    expect(await status(p.id)).toMatchObject({ pending: 0, silent: 0, safe: true })
  })
  it('per device: the states agree with the counts; the blocking phone carries its counts for this period only', async () => {
    const p = freshPeriod(), other = freshPeriod()
    const d = await newDevice()
    await ok(d, { days: [{ day: p.day, services: 2, conflicts: 1 }, { day: other.day, services: 7 }], undated: { drafts: 1 } })
    const s = await status(p.id)
    const devices = s.devices as Row[]
    for (const k of ['ready', 'pending', 'silent']) expect(devices.filter((x) => x.state === k).length, k).toBe(s[k])
    expect(devices.filter((x) => x.this_device)).toHaveLength(1)                              // the manager's own device
    expect(devices.filter((x) => x.state === 'pending')).toEqual([expect.objectContaining({ services: 2, conflicts: 1, drafts: 1, this_device: false })])
    expect(s.period_ended).toBe(true)
    expect((await approve(p.id)).error?.message).toBe('PERIOD_OFFLINE_SYNC_PENDING')             // the block is unchanged
    await ok(d, zero)
    const after = await status(p.id)
    expect(after).toMatchObject({ pending: 0, safe: true })
    expect((after.devices as Row[]).every((x) => x.state === 'ready')).toBe(true)
  })
  it('a period that has not ended: every device is silent and the status says the period has not ended', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Luanda', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const p = ((await mgr.rpc('fecho_periods')).data as Row[]).find((x) => x.starts_on === today)!
    const s = await status(p.id)
    expect(s).toMatchObject({ safe: false, period_ended: false })
    expect((s.devices as Row[]).every((x) => x.state === 'silent')).toBe(true)
  })
  it('a refused approval or close consumes nothing: the same grant then succeeds; the period is untouched', async () => {
    const p = freshPeriod()
    const d = await newDevice()
    await ok(d, pendingOn(p.day, 'services'))
    const g = await grant()
    expect((await approve(p.id, g)).error?.message).toBe('PERIOD_OFFLINE_SYNC_PENDING')
    expect(((await mgr.rpc('fecho_period', { p_period_id: p.id })).data as Row).period.state).toBe('aberto')
    await ok(d, zero)
    expect((await approve(p.id, g)).error).toBeNull()                                         // the grant was not consumed
    await ok(d, pendingOn(p.day, 'drafts'))
    const g2 = await grant()
    expect((await close(p.id, g2)).error?.message).toBe('PERIOD_OFFLINE_SYNC_PENDING')
    await ok(d, zero)
    expect((await close(p.id, g2)).error).toBeNull()
  })
  it('the block holds for an authorized manager, and the grant check still comes first', async () => {
    const p = freshPeriod()
    const d = await newDevice()
    await ok(d, pendingOn(p.day, 'services'))
    expect((await mgr.rpc('approve_period', { p_command_id: randomUUID(), p_grant_id: null, p_period_id: p.id, p_review_revision: await revision(p.id) })).error?.message)
      .toBe('VERIFICATION_REQUIRED')
    expect((await approve(p.id)).error?.message).toBe('PERIOD_OFFLINE_SYNC_PENDING')
    await ok(d, zero)
  })
})
