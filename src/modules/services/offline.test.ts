// Offline 4 · Registar serviço offline: the capture snapshot, the outbox entry, and the drainer (against a fake server
// that behaves like record_service's command journal: same id + payload + time replays, anything else conflicts).
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../shared/supabase/client', () => ({ getSupabase: vi.fn(() => { throw new Error('no backend in these tests') }) }))
import { AppError, toAppError } from '../../shared/errors'
import { openOfflineDb } from '../../shared/offline/db'
import { createOfflineStore, type OfflineStore } from '../../shared/offline/store'
import type { OutboxItem } from '../../shared/offline/types'
import type { QueuedServicePayload, RecordServiceInput, RecordServiceResult } from './api'
import {
  CAPTURE_SNAPSHOT_MAX_AGE_MS, captureSnapshotState, createServiceDrainer, queueService, readCaptureSnapshot, readQueuedPayload,
  writeCaptureSnapshot, type ServiceDrainDeps,
} from './offline'

const ORG = '00000000-0000-4000-8000-0000000000f6', USER = '11111111-1111-4111-8111-111111111111'
const id = () => crypto.randomUUID()
const P1 = id(), S1 = id(), M1 = id(), M2 = id()
const input = (over: Partial<RecordServiceInput> = {}): RecordServiceInput => ({
  personId: P1, serviceId: S1, valueMinor: 1234500, payments: [{ method_id: M1, amount_minor: 1000000 }, { method_id: M2, amount_minor: 234500 }], ...over,
})
const at = (h: number) => new Date(Date.parse('2026-10-15T10:00:00.000Z') - h * 3600_000).toISOString()

let store: OfflineStore
beforeEach(async () => { store = createOfflineStore(await openOfflineDb({ factory: new IDBFactory() }), { organizationId: ORG, deviceUserId: USER }) })

describe('capture snapshot', () => {
  const data = {
    people: [{ id: P1, display_name: 'Ana', capabilities: ['Cabelo'], last_service_at: '2026-10-14T10:00:00Z', earned_minor: 5 }],
    services: [{ id: S1, name: 'Corte', default_price_minor: 350000, sort_order: 1 }],
    paymentMethods: [{ id: M1, code: 'numerario', label: 'Numerário' }],
  }
  it('keeps exactly the public capture fields of each list, with fetchedAt', async () => {
    await writeCaptureSnapshot(store, data as never, at(1))
    expect(await readCaptureSnapshot(store)).toEqual({
      people: [{ id: P1, display_name: 'Ana', capabilities: ['Cabelo'] }],
      services: [{ id: S1, name: 'Corte', default_price_minor: 350000 }],
      paymentMethods: [{ id: M1, code: 'numerario', label: 'Numerário' }],
      fetchedAt: at(1),
    })
    expect(JSON.stringify(await store.snapshot.listMeta())).not.toMatch(/earned|last_service|sort_order/)
  })
  it('missing, stale (> 48 h) or usable (≤ 48 h)', async () => {
    const now = Date.parse('2026-10-15T10:00:00.000Z')
    expect(captureSnapshotState(await readCaptureSnapshot(store), now)).toBe('missing')
    await writeCaptureSnapshot(store, data as never, at(48))
    expect(captureSnapshotState(await readCaptureSnapshot(store), now)).toBe('ok')                    // exactly 48 h: usable
    await writeCaptureSnapshot(store, data as never, new Date(now - CAPTURE_SNAPSHOT_MAX_AGE_MS - 1).toISOString())
    expect(captureSnapshotState(await readCaptureSnapshot(store), now)).toBe('stale')
    await writeCaptureSnapshot(store, { ...data, paymentMethods: [] } as never, at(1))
    expect(captureSnapshotState(await readCaptureSnapshot(store), now)).toBe('missing')                // nothing to pay with
  })
  it('one group missing is a missing snapshot', async () => {
    await writeCaptureSnapshot(store, data as never, at(1))
    await store.snapshot.replace('people', { version: 99, fetchedAt: at(1), data: [] })                 // unknown shape version
    expect(await readCaptureSnapshot(store)).toBeNull()
  })
})

describe('outbox entry', () => {
  it('stores exactly the record_service arguments; amounts and parts are preserved', async () => {
    const cmd = id()
    const item = await queueService(store, cmd, input(), at(0))
    expect(item).toMatchObject({ commandId: cmd, type: 'record_service', state: 'local', occurredAt: at(0) })
    expect(item.payload).toEqual({ p_person_id: P1, p_service_id: S1, p_value_minor: 1234500,
      p_payments: [{ method_id: M1, amount_minor: 1000000 }, { method_id: M2, amount_minor: 234500 }] })
    expect(readQueuedPayload(item.payload)).toEqual(item.payload)
  })
  it('the same command again is one item; a changed payload or time under that id is refused', async () => {
    const cmd = id()
    await queueService(store, cmd, input(), at(0))
    await queueService(store, cmd, input(), at(0))
    expect(await store.outbox.list()).toHaveLength(1)
    await expect(queueService(store, cmd, input({ valueMinor: 1 }), at(0))).rejects.toMatchObject({ code: 'RECORD_CONFLICT' })
    await expect(queueService(store, cmd, input(), at(1))).rejects.toMatchObject({ code: 'RECORD_CONFLICT' })
  })
  it('a payload with anything beyond the four arguments is not sendable', () => {
    expect(readQueuedPayload({ p_person_id: P1, p_service_id: S1, p_value_minor: 1, p_payments: [], p_grant_id: id() } as never)).toBeNull()
    expect(readQueuedPayload({ p_person_id: P1, p_service_id: S1, p_value_minor: 1.5, p_payments: [] })).toBeNull()
  })
})

// ---------- drainer ----------
type Sent = { commandId: string; payload: QueuedServicePayload; occurredAt: string }
function fakeServer() {
  const journal = new Map<string, { key: string; result: RecordServiceResult }>()
  const sent: Sent[] = []
  let failNext: AppError | null = null, dropNextAnswer = false
  const submit = vi.fn(async (commandId: string, payload: QueuedServicePayload, occurredAt: string) => {
    sent.push({ commandId, payload, occurredAt })
    if (failNext) { const e = failNext; failNext = null; throw e }
    const key = JSON.stringify([payload, occurredAt])
    const j = journal.get(commandId)
    let result: RecordServiceResult
    if (j) {
      if (j.key !== key) throw toAppError({ message: 'IDEMPOTENCY_CONFLICT' })
      result = { ...j.result, replayed: true }
    } else {
      result = { record_id: id(), occurred_at: occurredAt }
      journal.set(commandId, { key, result })
    }
    if (dropNextAnswer) { dropNextAnswer = false; throw new AppError('network', 'Failed to fetch') }      // committed, answer lost
    return result
  })
  return {
    submit, sent, journal,
    fail: (e: AppError) => { failNext = e },
    dropAnswer: () => { dropNextAnswer = true },
  }
}
const deps = (server: ReturnType<typeof fakeServer>, over: Partial<ServiceDrainDeps> = {}): ServiceDrainDeps => ({
  deviceContext: async () => ({ bound: true, organization: { id: ORG, name: 'O', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' } }),
  sessionPrincipal: async () => USER,
  submit: server.submit,
  now: () => new Date('2026-10-15T10:00:00.000Z'),
  ...over,
})
const signal = () => new AbortController().signal
async function queue(n: number) {
  const items: OutboxItem[] = []
  for (let i = 0; i < n; i++) items.push(await queueService(store, id(), input({ valueMinor: 1000 * (i + 1), payments: [{ method_id: M1, amount_minor: 1000 * (i + 1) }] }), at(3 - i)))
  return items
}

describe('drain', () => {
  it('sends the original command id and capture time, oldest first; synced only with the answer', async () => {
    const server = fakeServer()
    const items = await queue(3)
    expect(await createServiceDrainer(deps(server))(store, signal())).toEqual({ synced: 3, failed: 0, conflicts: 0 })
    expect(server.sent.map((s) => [s.commandId, s.occurredAt])).toEqual(items.map((i) => [i.commandId, i.occurredAt]))
    expect(server.sent[0]!.payload).toEqual(items[0]!.payload)
    for (const i of items) {
      const after = await store.outbox.get(i.commandId)
      expect(after).toMatchObject({ state: 'synced', attempts: 1, lastError: null, ack: { record_id: server.journal.get(i.commandId)!.result.record_id, replayed: false } })
    }
    expect(await store.meta.get('lastSuccessfulSyncAt')).toBe('2026-10-15T10:00:00.000Z')
    expect(await store.outbox.countPending()).toBe(0)
  })
  it('a transient failure keeps the item (failed, retryable) and stops; the next cycle sends it', async () => {
    const server = fakeServer()
    const [a, b] = await queue(2)
    server.fail(new AppError('network', 'Failed to fetch'))
    expect(await createServiceDrainer(deps(server))(store, signal())).toEqual({ synced: 0, failed: 1, conflicts: 0, stopped: 'network' })
    expect(await store.outbox.get(a!.commandId)).toMatchObject({ state: 'failed', lastError: 'network', nextAttemptAt: '2026-10-15T10:01:00.000Z' })
    expect((await store.outbox.get(b!.commandId))?.state).toBe('local')                                    // not tried after the stop
    expect(await createServiceDrainer(deps(server))(store, signal())).toEqual({ synced: 2, failed: 0, conflicts: 0 })
    expect((await store.outbox.get(a!.commandId))?.attempts).toBe(2)
  })
  it('a domain rejection becomes a conflict (never retried blindly); the drain goes on', async () => {
    const server = fakeServer()
    const [a, b] = await queue(2)
    server.fail(toAppError({ message: 'PERIOD_APPROVED' }))
    expect(await createServiceDrainer(deps(server))(store, signal())).toEqual({ synced: 1, failed: 0, conflicts: 1 })
    expect(await store.outbox.get(a!.commandId)).toMatchObject({ state: 'conflict', lastError: 'PERIOD_APPROVED' })
    expect((await store.outbox.get(b!.commandId))?.state).toBe('synced')
    server.submit.mockClear()
    expect(await createServiceDrainer(deps(server))(store, signal())).toEqual({ synced: 0, failed: 0, conflicts: 0 })
    expect(server.submit).not.toHaveBeenCalled()
  })
  it('each distinct Offline 1 rejection is kept as a conflict with its code', async () => {
    for (const code of ['PERSON_INACTIVE', 'SERVICE_INACTIVE', 'PAYMENT_METHOD_INACTIVE', 'PERIOD_CLOSED', 'CAPTURE_TIME_TOO_OLD', 'CAPTURE_TIME_IN_FUTURE', 'IDEMPOTENCY_CONFLICT']) {
      const server = fakeServer()
      const [a] = await queue(1)
      server.fail(toAppError({ message: code }))
      await createServiceDrainer(deps(server))(store, signal())
      expect(await store.outbox.get(a!.commandId), code).toMatchObject({ state: 'conflict', lastError: code })
    }
  })
  it('an uncertain answer (committed, then the connection dropped) is replayed with the same id: one record', async () => {
    const server = fakeServer()
    const [a] = await queue(1)
    server.dropAnswer()
    expect((await createServiceDrainer(deps(server))(store, signal())).failed).toBe(1)
    expect(server.journal.size).toBe(1)
    expect(await createServiceDrainer(deps(server))(store, signal())).toEqual({ synced: 1, failed: 0, conflicts: 0 })
    expect(server.journal.size).toBe(1)                                                                   // no duplicate
    expect(server.sent.map((s) => s.commandId)).toEqual([a!.commandId, a!.commandId])
    expect((await store.outbox.get(a!.commandId))?.ack).toMatchObject({ replayed: true, record_id: server.journal.get(a!.commandId)!.result.record_id })
  })
  it('a device no longer bound: nothing is sent and every item stays', async () => {
    const server = fakeServer()
    await queue(2)
    expect(await createServiceDrainer(deps(server, { deviceContext: async () => ({ bound: false }) }))(store, signal()))
      .toEqual({ synced: 0, failed: 0, conflicts: 0, stopped: 'unbound' })
    expect(server.submit).not.toHaveBeenCalled()
    expect(await store.outbox.countPending()).toBe(2)
  })
  it('another principal, or the device bound to another organization: the old partition is not replayed', async () => {
    const server = fakeServer()
    await queue(1)
    expect((await createServiceDrainer(deps(server, { sessionPrincipal: async () => id() }))(store, signal())).stopped).toBe('principal_changed')
    const other = { bound: true as const, organization: { id: id(), name: 'X', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' } }
    expect((await createServiceDrainer(deps(server, { deviceContext: async () => other }))(store, signal())).stopped).toBe('principal_changed')
    expect(server.submit).not.toHaveBeenCalled()
    expect((await store.outbox.list())[0]?.state).toBe('local')
  })
  it('NOT_AUTHORIZED during the drain: that item needs review and the drain stops', async () => {
    const server = fakeServer()
    const [a, b] = await queue(2)
    server.fail(toAppError({ message: 'NOT_AUTHORIZED' }))
    expect(await createServiceDrainer(deps(server))(store, signal())).toEqual({ synced: 0, failed: 0, conflicts: 1, stopped: 'unbound' })
    expect((await store.outbox.get(a!.commandId))?.state).toBe('conflict')
    expect((await store.outbox.get(b!.commandId))?.state).toBe('local')
  })
  it('a check that cannot reach the server stops before sending', async () => {
    const server = fakeServer()
    await queue(1)
    expect((await createServiceDrainer(deps(server, { deviceContext: async () => { throw new AppError('network', 'x') } }))(store, signal())).stopped).toBe('network')
    expect(server.submit).not.toHaveBeenCalled()
  })
  it('only record_service items are ever submitted', async () => {
    const server = fakeServer()
    const other = { ...(await queue(1))[0]!, commandId: id(), type: 'record_advance' as never }
    const fake = { ...store, outbox: { ...store.outbox, list: async () => [other] } } as OfflineStore
    expect(await createServiceDrainer(deps(server))(fake, signal())).toEqual({ synced: 0, failed: 0, conflicts: 0 })
    expect(server.submit).not.toHaveBeenCalled()
  })
})
