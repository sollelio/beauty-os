// Offline 2 · the versioned database and its failure behaviour (ADR-0010 §6). In-memory IndexedDB.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BINDING_STORE, LOGO_STORE, OFFLINE_DB_NAME, OFFLINE_DB_VERSION, openOfflineDb, STORES, UPGRADE_STEPS } from './db'
import { OfflineStorageError, toStorageError } from './errors'
import { createOfflineStore } from './store'

const A1 = { organizationId: '00000000-0000-4000-8000-0000000000a1', deviceUserId: '11111111-1111-4111-8111-111111111111' }
const item = () => ({ commandId: crypto.randomUUID(), type: 'record_service' as const, occurredAt: '2026-10-15T09:00:00.000Z', payload: { p_value_minor: 100 } })
const failure = async (p: Promise<unknown>) => {
  try { await p } catch (e) { return e }
  throw new Error('expected a failure')
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('schema', () => {
  it('opens with an explicit version and creates the partitioned stores (with their indexes) and the binding store', async () => {
    expect(OFFLINE_DB_NAME).toBe('beauty-os-offline')
    expect(OFFLINE_DB_VERSION).toBe(3)
    const db = await openOfflineDb({ factory: new IDBFactory() })
    expect(db.name).toBe(OFFLINE_DB_NAME)
    expect(db.version).toBe(OFFLINE_DB_VERSION)
    expect([...db.objectStoreNames].sort()).toEqual([...STORES, BINDING_STORE, LOGO_STORE].sort())
    const tx = db.transaction([...STORES], 'readonly')
    for (const s of STORES) expect([...tx.objectStore(s).indexNames], s).toContain('partition')
    expect([...tx.objectStore('outbox').indexNames]).toContain('partitionState')
    expect(tx.objectStore('outbox').keyPath).toEqual(['organizationId', 'deviceUserId', 'commandId'])
    expect(db.transaction(BINDING_STORE).objectStore(BINDING_STORE).keyPath).toBe('deviceUserId')
  })
  it('a later version runs only its own step and keeps the existing records', async () => {
    const factory = new IDBFactory()
    const v1 = await openOfflineDb({ factory })
    const kept = item()
    await createOfflineStore(v1, A1).outbox.put(kept)
    v1.close()
    const step2 = vi.fn((_db: IDBDatabase, tx: IDBTransaction) => { tx.objectStore('outbox').createIndex('byCreatedAt', 'createdAt') })
    const v2 = await openOfflineDb({ factory, steps: [...UPGRADE_STEPS, step2] })
    expect(v2.version).toBe(OFFLINE_DB_VERSION + 1)
    expect(step2).toHaveBeenCalledTimes(1)
    expect([...v2.transaction('outbox').objectStore('outbox').indexNames]).toContain('byCreatedAt')
    expect((await createOfflineStore(v2, A1).outbox.get(kept.commandId))?.payload).toEqual(kept.payload)
  })
  it('an open connection steps aside for a newer version (another tab)', async () => {
    const factory = new IDBFactory()
    const old = await openOfflineDb({ factory })
    const close = vi.spyOn(old, 'close')
    const v2 = await openOfflineDb({ factory, steps: [...UPGRADE_STEPS, () => {}] })
    expect(close).toHaveBeenCalled()
    expect(v2.version).toBe(OFFLINE_DB_VERSION + 1)
  })
})

describe('failures are explicit', () => {
  it('no IndexedDB: UNAVAILABLE, and nothing is written to localStorage instead', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const e = await failure(openOfflineDb())
    expect(e).toBeInstanceOf(OfflineStorageError)
    expect((e as OfflineStorageError).code).toBe('UNAVAILABLE')
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })
  it('a database newer than this code: OPEN_FAILED', async () => {
    const factory = new IDBFactory()
    ;(await openOfflineDb({ factory, steps: [...UPGRADE_STEPS, () => {}] })).close()
    expect(((await failure(openOfflineDb({ factory }))) as OfflineStorageError).code).toBe('OPEN_FAILED')
  })
  it('a full device: QUOTA_EXCEEDED, the write is not kept, and no localStorage fallback', async () => {
    const db = await openOfflineDb({ factory: new IDBFactory() })
    const s = createOfflineStore(db, A1)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    const e = await failure(s.outbox.put(item()))
    expect((e as OfflineStorageError).code).toBe('QUOTA_EXCEEDED')
    vi.mocked(IDBObjectStore.prototype.add).mockRestore()
    expect(await s.outbox.list()).toEqual([])
    expect(setItem).not.toHaveBeenCalled()
  })
  it('maps browser errors to storage codes', () => {
    expect(toStorageError(new DOMException('x', 'QuotaExceededError'), 'WRITE_FAILED').code).toBe('QUOTA_EXCEEDED')
    expect(toStorageError(new DOMException('x', 'InvalidStateError'), 'WRITE_FAILED').code).toBe('WRITE_FAILED')
    expect(toStorageError(new Error('x'), 'READ_FAILED').code).toBe('READ_FAILED')
  })
  it('a malformed or misplaced stored record is reported, not returned', async () => {
    const db = await openOfflineDb({ factory: new IDBFactory() })
    const s = createOfflineStore(db, A1)
    const good = item()
    await s.outbox.put(good)
    const raw = db.transaction('outbox', 'readwrite').objectStore('outbox')
    await new Promise((r) => { raw.put({ ...A1, commandId: crypto.randomUUID(), type: 'record_service', state: 'weird' }).onsuccess = r })
    expect(((await failure(s.outbox.list())) as OfflineStorageError).code).toBe('MALFORMED_RECORD')
  })
})

describe('upgrade from version 1 (Offline 2) to 2 (Offline 4)', () => {
  it('adds the binding store and keeps every partitioned record', async () => {
    const factory = new IDBFactory()
    const v1 = await openOfflineDb({ factory, steps: UPGRADE_STEPS.slice(0, 1) })
    const kept = item()
    await createOfflineStore(v1, A1).outbox.put(kept)
    v1.close()
    const v2 = await openOfflineDb({ factory, steps: UPGRADE_STEPS.slice(0, 2) })
    expect(v2.version).toBe(2)
    expect([...v2.objectStoreNames]).toContain(BINDING_STORE)
    expect((await createOfflineStore(v2, A1).outbox.get(kept.commandId))?.state).toBe('local')
  })
})

describe('upgrade from version 2 (Offline 4) to 3 (Tenant Identity T2)', () => {
  it('adds the logo store and keeps queued work and the cached binding', async () => {
    const factory = new IDBFactory()
    const v2 = await openOfflineDb({ factory, steps: UPGRADE_STEPS.slice(0, 2) })
    const kept = item()
    await createOfflineStore(v2, A1).outbox.put(kept)
    await new Promise((r) => { v2.transaction(BINDING_STORE, 'readwrite').objectStore(BINDING_STORE).put({ deviceUserId: A1.deviceUserId, marker: 1 }).onsuccess = r })
    v2.close()
    const v3 = await openOfflineDb({ factory })
    expect(v3.version).toBe(3)
    expect(v3.transaction(LOGO_STORE).objectStore(LOGO_STORE).keyPath).toEqual(['organizationId', 'deviceUserId', 'size'])
    expect((await createOfflineStore(v3, A1).outbox.get(kept.commandId))?.state).toBe('local')
    const binding = await new Promise((r) => { const q = v3.transaction(BINDING_STORE).objectStore(BINDING_STORE).get(A1.deviceUserId); q.onsuccess = () => r(q.result) })
    expect(binding).toEqual({ deviceUserId: A1.deviceUserId, marker: 1 })
  })
})

