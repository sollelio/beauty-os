// Offline 2 · store contracts per partition (ADR-0010 §6): outbox, drafts, snapshot, meta. In-memory IndexedDB.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { openOfflineDb } from './db'
import { OfflineStorageError } from './errors'
import { createOfflineStore, type OfflineStore } from './store'
import type { JsonObject, NewOutboxItem, Partition } from './types'

const ORG_A = '00000000-0000-4000-8000-0000000000a1', ORG_B = '00000000-0000-4000-8000-0000000000b1'
const USER_1 = '11111111-1111-4111-8111-111111111111', USER_2 = '22222222-2222-4222-8222-222222222222'
const A1: Partition = { organizationId: ORG_A, deviceUserId: USER_1 }
const id = () => crypto.randomUUID()
const svc = (over: Partial<NewOutboxItem> = {}): NewOutboxItem => ({
  commandId: id(), type: 'record_service', occurredAt: '2026-10-15T09:30:00.000Z',
  payload: { p_person_id: id(), p_service_id: id(), p_value_minor: 350000, p_payments: [{ method_id: id(), amount_minor: 350000 }] },
  ...over,
})
const code = async (p: Promise<unknown>) => {
  try { await p } catch (e) { return e instanceof OfflineStorageError ? e.code : `not an OfflineStorageError: ${String(e)}` }
  return 'resolved'
}

let db: IDBDatabase, store: (p: Partition) => OfflineStore, s: OfflineStore
beforeEach(async () => {
  db = await openOfflineDb({ factory: new IDBFactory() })
  let t = Date.parse('2026-10-15T10:00:00.000Z')
  const clock = () => new Date((t += 1000)).toISOString()
  store = (p) => createOfflineStore(db, p, clock)
  s = store(A1)
})

describe('outbox', () => {
  it('put stores a local command with its partition; get returns it', async () => {
    const item = svc()
    const stored = await s.outbox.put(item)
    expect(stored).toMatchObject({ ...A1, commandId: item.commandId, state: 'local', attempts: 0, nextAttemptAt: null, lastError: null, ack: null, deviceId: null })
    expect(await s.outbox.get(item.commandId)).toEqual(stored)
    expect(await s.outbox.get(id())).toBeNull()
  })
  it('the same command id again is a no-op; with different content it is RECORD_CONFLICT and the stored one stays', async () => {
    const item = svc()
    const first = await s.outbox.put(item)
    await s.outbox.updateState(item.commandId, { state: 'syncing' })
    const reordered = { ...item, payload: { p_payments: item.payload.p_payments!, p_value_minor: 350000, p_service_id: item.payload.p_service_id!, p_person_id: item.payload.p_person_id! } }
    expect(await s.outbox.put(reordered)).toMatchObject({ commandId: item.commandId, state: 'syncing', createdAt: first.createdAt })
    expect(await code(s.outbox.put({ ...item, occurredAt: '2026-10-15T09:31:00.000Z' }))).toBe('RECORD_CONFLICT')
    expect(await code(s.outbox.put({ ...item, payload: { ...item.payload, p_value_minor: 1 } }))).toBe('RECORD_CONFLICT')
    expect((await s.outbox.get(item.commandId))?.payload).toEqual(item.payload)
    expect(await s.outbox.list()).toHaveLength(1)
  })
  it('list is oldest first; listByState filters; counts and pending reflect the states', async () => {
    const [a, b, c, d] = [svc(), svc(), svc(), svc()]
    for (const x of [a, b, c, d]) await s.outbox.put(x)
    expect((await s.outbox.list()).map((x) => x.commandId)).toEqual([a, b, c, d].map((x) => x.commandId))
    await s.outbox.updateState(b.commandId, { state: 'syncing' })
    await s.outbox.updateState(b.commandId, { state: 'synced', ack: { record_id: id(), occurred_at: a.occurredAt } })
    await s.outbox.updateState(c.commandId, { state: 'conflict', lastError: 'PERIOD_APPROVED' })
    expect((await s.outbox.listByState('local')).map((x) => x.commandId)).toEqual([a.commandId, d.commandId])
    expect((await s.outbox.listByState('conflict')).map((x) => x.commandId)).toEqual([c.commandId])
    expect(await s.outbox.countByState()).toEqual({ local: 2, syncing: 0, synced: 1, failed: 0, conflict: 1 })
    expect(await s.outbox.countPending()).toBe(3)                                    // a conflict is unsynced work
  })
  it('state transitions persist with their retry fields; disallowed transitions are refused', async () => {
    const item = svc()
    await s.outbox.put(item)
    await s.outbox.updateState(item.commandId, { state: 'syncing', attempts: 1 })
    await s.outbox.updateState(item.commandId, { state: 'failed', nextAttemptAt: '2026-10-15T10:05:00.000Z', lastError: 'network' })
    const reopened = createOfflineStore(db, A1)
    expect(await reopened.outbox.get(item.commandId)).toMatchObject({ state: 'failed', attempts: 1, nextAttemptAt: '2026-10-15T10:05:00.000Z', lastError: 'network' })
    expect(await code(s.outbox.updateState(item.commandId, { state: 'synced' }))).toBe('INVALID_TRANSITION')        // only from syncing
    await s.outbox.updateState(item.commandId, { state: 'syncing', attempts: 2 })
    await s.outbox.updateState(item.commandId, { state: 'synced', ack: { record_id: id() } })
    expect(await code(s.outbox.updateState(item.commandId, { state: 'local' }))).toBe('INVALID_TRANSITION')        // synced is final
    expect(await code(s.outbox.updateState(id(), { state: 'syncing' }))).toBe('NOT_FOUND')
    expect(await code(s.outbox.updateState(item.commandId, { state: 'nonsense' as never }))).toBe('MALFORMED_RECORD')
  })
  it('only Registar serviço can be queued (ADR-0010 §1)', async () => {
    expect(await code(s.outbox.put(svc({ type: 'record_advance' as never })))).toBe('MALFORMED_RECORD')
    expect(await code(s.outbox.put(svc({ commandId: 'not-a-uuid' })))).toBe('MALFORMED_RECORD')
    expect(await code(s.outbox.put(svc({ occurredAt: '2026-10-15 09:30' })))).toBe('MALFORMED_RECORD')
  })
  it('delete removes only that command', async () => {
    const [a, b] = [svc(), svc()]
    await s.outbox.put(a); await s.outbox.put(b)
    await s.outbox.delete(a.commandId)
    expect((await s.outbox.list()).map((x) => x.commandId)).toEqual([b.commandId])
  })
})

describe('partitions', () => {
  it('another organization does not see this partition (and the reverse)', async () => {
    const item = svc()
    await s.outbox.put(item)
    await s.drafts.put({ draftId: id(), type: 'expense', capturedAt: '2026-10-15T09:00:00.000Z', payload: { p_amount_minor: 100 } })
    await s.snapshot.replace('services', { version: 1, fetchedAt: '2026-10-15T08:00:00.000Z', data: [{ id: id(), name: 'Corte' }] })
    await s.meta.set('lastServerTimeOffsetMs', 120)
    const b = store({ organizationId: ORG_B, deviceUserId: USER_1 })
    expect(await b.outbox.list()).toEqual([])
    expect(await b.outbox.get(item.commandId)).toBeNull()
    expect(await b.outbox.countPending()).toBe(0)
    expect(await b.drafts.list()).toEqual([])
    expect(await b.snapshot.get('services')).toBeNull()
    expect(await b.meta.all()).toEqual({})
  })
  it('another principal of the same organization does not see it either', async () => {
    await s.outbox.put(svc())
    const other = store({ organizationId: ORG_A, deviceUserId: USER_2 })
    expect(await other.outbox.list()).toEqual([])
    expect(await other.outbox.listByState('local')).toEqual([])
    expect(await other.drafts.countPending()).toBe(0)
  })
  it('the same command id in two partitions is two separate commands', async () => {
    const item = svc()
    const other = store({ organizationId: ORG_B, deviceUserId: USER_2 })
    await s.outbox.put(item)
    await other.outbox.put({ ...item, payload: { p_value_minor: 1 } })                        // no conflict across partitions
    await other.outbox.updateState(item.commandId, { state: 'syncing' })
    expect((await s.outbox.get(item.commandId))?.state).toBe('local')
    expect((await s.outbox.get(item.commandId))?.payload).toEqual(item.payload)
    await other.outbox.delete(item.commandId)
    expect(await s.outbox.get(item.commandId)).not.toBeNull()
  })
  it('a store needs a valid partition', () => {
    expect(() => createOfflineStore(db, { organizationId: 'Salão', deviceUserId: USER_1 })).toThrow(OfflineStorageError)
    expect(() => createOfflineStore(db, { organizationId: ORG_A } as Partition)).toThrow(OfflineStorageError)
  })
})

describe('drafts', () => {
  it('put / get / list / delete / count pending', async () => {
    const d1 = { draftId: id(), type: 'advance' as const, capturedAt: '2026-10-15T09:00:00.000Z', payload: { p_person_id: id(), p_amount_minor: 200000 } }
    const d2 = { draftId: id(), type: 'purchase' as const, capturedAt: '2026-10-15T09:10:00.000Z',
      payload: { p_lines: [{ product_id: id(), quantity: 2, line_cost_minor: 5000 }], p_salon_amount_minor: 5000, p_contributions: [] } }
    const first = await s.drafts.put(d1)
    expect(first).toMatchObject({ ...A1, draftId: d1.draftId, state: 'draft', deviceId: null })
    await s.drafts.put(d2)
    expect(await s.drafts.countPending()).toBe(2)
    const edited = await s.drafts.put({ ...d1, payload: { ...d1.payload, p_amount_minor: 250000 } })
    expect(edited.createdAt).toBe(first.createdAt)
    expect(edited.updatedAt > first.updatedAt).toBe(true)
    expect((await s.drafts.get(d1.draftId))?.payload.p_amount_minor).toBe(250000)
    await s.drafts.put({ ...d2, state: 'submitted' })
    expect(await s.drafts.countPending()).toBe(1)
    expect((await s.drafts.list()).map((d) => d.draftId)).toEqual([d1.draftId, d2.draftId])
    await s.drafts.delete(d1.draftId)
    expect(await s.drafts.get(d1.draftId)).toBeNull()
    expect(await s.drafts.countPending()).toBe(0)
  })
  it('only the approved types and states; the type is fixed and submitted does not go back', async () => {
    const base = { draftId: id(), type: 'expense' as const, capturedAt: '2026-10-15T09:00:00.000Z', payload: { p_amount_minor: 100 } }
    expect(await code(s.drafts.put({ ...base, type: 'service' as never }))).toBe('MALFORMED_RECORD')
    expect(await code(s.drafts.put({ ...base, state: 'confirmed' as never }))).toBe('MALFORMED_RECORD')
    await s.drafts.put(base)
    expect(await code(s.drafts.put({ ...base, type: 'advance' }))).toBe('RECORD_CONFLICT')
    await s.drafts.put({ ...base, state: 'submitted' })
    expect(await code(s.drafts.put({ ...base, state: 'draft' }))).toBe('INVALID_TRANSITION')
  })
  it('a draft never holds a PIN, a grant id or private-session state', async () => {
    const base = { draftId: id(), type: 'advance' as const, capturedAt: '2026-10-15T09:00:00.000Z' }
    const forbidden: JsonObject[] = [{ p_amount_minor: 1, p_grant_id: id() }, { p_amount_minor: 1, grantId: id() }, { p_amount_minor: 1, pin: '135790' },
      { p_secret: '135790' }, { confirm: { PIN: '1' } }, { private_session: true }, { lines: [{ pinHash: 'x' }] }]
    for (const payload of forbidden) {
      expect(await code(s.drafts.put({ ...base, payload })), JSON.stringify(payload)).toBe('FORBIDDEN_FIELD')
    }
    expect(await s.drafts.list()).toEqual([])
  })
})

describe('snapshot', () => {
  const services = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `00000000-0000-4000-8000-00000000030${i}`, name: `Serviço ${i}`, default_price_minor: 1000 * (i + 1) }))
  it('replace keeps fetchedAt and version; a later replace swaps the whole group', async () => {
    await s.snapshot.replace('services', { version: 1, fetchedAt: '2026-10-15T08:00:00.000Z', data: services(3) })
    expect(await s.snapshot.get('services')).toMatchObject({ ...A1, group: 'services', version: 1, fetchedAt: '2026-10-15T08:00:00.000Z', data: services(3) })
    await s.snapshot.replace('services', { version: 2, fetchedAt: '2026-10-15T09:00:00.000Z', data: services(1) })
    expect(await s.snapshot.get('services')).toMatchObject({ version: 2, fetchedAt: '2026-10-15T09:00:00.000Z', data: services(1) })
  })
  it('a refused replace leaves the previous group exactly as it was', async () => {
    await s.snapshot.replace('services', { version: 1, fetchedAt: '2026-10-15T08:00:00.000Z', data: services(3) })
    const bad = [...services(2), { id: 'x', name: 'Mau', default_price_minor: 10.5 }]
    expect(await code(s.snapshot.replace('services', { version: 2, fetchedAt: '2026-10-15T09:00:00.000Z', data: bad }))).toBe('MALFORMED_RECORD')
    expect(await code(s.snapshot.replace('services', { version: 2, fetchedAt: 'today', data: services(1) }))).toBe('MALFORMED_RECORD')
    expect(await code(s.snapshot.replace('fecho' as never, { version: 1, fetchedAt: '2026-10-15T09:00:00.000Z', data: [] }))).toBe('MALFORMED_RECORD')
    expect(await s.snapshot.get('services')).toMatchObject({ version: 1, data: services(3) })
  })
  it('listMeta describes each group without content; groups stay partitioned; clear empties this partition only', async () => {
    await s.snapshot.replace('services', { version: 1, fetchedAt: '2026-10-15T08:00:00.000Z', data: services(3) })
    await s.snapshot.replace('hojeSummary', { version: 1, fetchedAt: '2026-10-15T08:05:00.000Z', data: { count: 4, total_minor: 1200000 } })
    const b = store({ organizationId: ORG_B, deviceUserId: USER_1 })
    await b.snapshot.replace('services', { version: 1, fetchedAt: '2026-10-15T07:00:00.000Z', data: services(1) })
    expect(await s.snapshot.listMeta()).toEqual([
      { group: 'hojeSummary', version: 1, fetchedAt: '2026-10-15T08:05:00.000Z', size: null },
      { group: 'services', version: 1, fetchedAt: '2026-10-15T08:00:00.000Z', size: 3 },
    ])
    await s.snapshot.clear()
    expect(await s.snapshot.listMeta()).toEqual([])
    expect(await b.snapshot.listMeta()).toEqual([{ group: 'services', version: 1, fetchedAt: '2026-10-15T07:00:00.000Z', size: 1 }])
  })
  it('public stock fields are accepted; private finance fields are not', async () => {
    await s.snapshot.replace('products', { version: 1, fetchedAt: '2026-10-15T08:00:00.000Z', data: [{ id: id(), name: 'Acetona', reserve_units: 1, on_list: true }] })
    expect(await code(s.snapshot.replace('products', { version: 1, fetchedAt: '2026-10-15T08:00:00.000Z', data: [{ reserve_used_minor: 1 }] }))).toBe('FORBIDDEN_FIELD')
    expect(await code(s.snapshot.replace('hojeSummary', { version: 1, fetchedAt: '2026-10-15T08:00:00.000Z', data: { earned_minor: 1 } }))).toBe('FORBIDDEN_FIELD')
  })
})

describe('meta', () => {
  it('set / get / all per partition, with typed values', async () => {
    await s.meta.set('lastSuccessfulSyncAt', '2026-10-15T09:59:00.000Z')
    await s.meta.set('lastServerTimeOffsetMs', -1500)
    await s.meta.recordSchemaVersion()
    expect(await s.meta.get('lastSuccessfulSyncAt')).toBe('2026-10-15T09:59:00.000Z')
    expect(await s.meta.all()).toEqual({ lastSuccessfulSyncAt: '2026-10-15T09:59:00.000Z', lastServerTimeOffsetMs: -1500, storageSchemaVersion: db.version })
    expect(await store({ organizationId: ORG_A, deviceUserId: USER_2 }).meta.get('lastServerTimeOffsetMs')).toBeNull()
    expect(await code(s.meta.set('lastSuccessfulSyncAt', 'ontem'))).toBe('MALFORMED_RECORD')
    expect(await code(s.meta.set('lastServerTimeOffsetMs', 1.5))).toBe('MALFORMED_RECORD')
    expect(await code(s.meta.set('deviceSyncToken' as never, 1 as never))).toBe('MALFORMED_RECORD')
  })
  it('records the persistence outcome: only granted is true', async () => {
    await s.meta.recordPersistResult('granted')
    expect(await s.meta.get('storagePersistGranted')).toBe(true)
    await s.meta.recordPersistResult('denied')
    expect(await s.meta.get('storagePersistGranted')).toBe(false)
    await s.meta.recordPersistResult('unavailable')
    expect(await s.meta.get('storagePersistGranted')).toBe(false)
  })
})
