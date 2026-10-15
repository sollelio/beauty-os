// The device's offline database (ADR-0010 §6): native IndexedDB behind a small promise wrapper, no library.
// Versioned by an ordered list of upgrade steps: version N = the first N steps. A later slice appends a step (a new
// index or store); an existing database runs only the steps it has not run yet, so its records are kept. A step is
// never edited once released, and no step wipes data by default.
import { OfflineStorageError, toStorageError } from './errors'
import type { Partition } from './types'

export const OFFLINE_DB_NAME = 'beauty-os-offline'
export const STORES = ['outbox', 'drafts', 'snapshot', 'meta'] as const
export type StoreName = (typeof STORES)[number]

export type UpgradeStep = (db: IDBDatabase, tx: IDBTransaction) => void

const PARTITION_KEY = ['organizationId', 'deviceUserId']

export const UPGRADE_STEPS: readonly UpgradeStep[] = [
  // 1 · Offline 2: the four stores; every primary key starts with the partition, and each store has a partition index
  (db) => {
    const outbox = db.createObjectStore('outbox', { keyPath: [...PARTITION_KEY, 'commandId'] })
    outbox.createIndex('partition', PARTITION_KEY)
    outbox.createIndex('partitionState', [...PARTITION_KEY, 'state'])
    db.createObjectStore('drafts', { keyPath: [...PARTITION_KEY, 'draftId'] }).createIndex('partition', PARTITION_KEY)
    db.createObjectStore('snapshot', { keyPath: [...PARTITION_KEY, 'group'] }).createIndex('partition', PARTITION_KEY)
    db.createObjectStore('meta', { keyPath: [...PARTITION_KEY, 'key'] }).createIndex('partition', PARTITION_KEY)
  },
]
export const OFFLINE_DB_VERSION = UPGRADE_STEPS.length

export type OpenOptions = { factory?: IDBFactory; name?: string; steps?: readonly UpgradeStep[] }

/** Opens (creating or upgrading) the database. Fails with UNAVAILABLE where there is no IndexedDB — no fallback. */
export function openOfflineDb({ factory, name = OFFLINE_DB_NAME, steps = UPGRADE_STEPS }: OpenOptions = {}): Promise<IDBDatabase> {
  const idb = factory ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB)
  if (!idb) return Promise.reject(new OfflineStorageError('UNAVAILABLE', 'IndexedDB is not available in this browser'))
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = idb.open(name, steps.length)
    } catch (e) {
      reject(toStorageError(e, 'OPEN_FAILED'))
      return
    }
    request.onupgradeneeded = (event) => {
      const db = request.result, tx = request.transaction!
      for (let v = event.oldVersion; v < steps.length; v++) steps[v]!(db, tx)
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()           // let a newer version (another tab) upgrade
      resolve(db)
    }
    request.onerror = () => reject(toStorageError(request.error, 'OPEN_FAILED'))
  })
}

export const promised = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

/**
 * Runs `body` in one transaction and resolves after the transaction has committed. If `body` throws or rejects, the
 * transaction is aborted and nothing it wrote is kept. `body` must only await requests of this transaction.
 */
export function transact<T>(db: IDBDatabase, stores: StoreName[], mode: IDBTransactionMode, body: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  const failure = mode === 'readonly' ? 'READ_FAILED' : 'WRITE_FAILED'
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction(stores, mode)
    } catch (e) {
      reject(toStorageError(e, failure))
      return
    }
    let settled = false, result: T | undefined, thrown: unknown
    tx.oncomplete = () => {
      if (thrown !== undefined) reject(toStorageError(thrown, failure))
      else if (!settled) reject(new OfflineStorageError(failure, 'the transaction finished before its work did'))
      else resolve(result as T)
    }
    tx.onabort = () => reject(toStorageError(thrown ?? tx.error, failure))
    body(tx).then(
      (r) => { settled = true; result = r },
      (e) => {
        settled = true
        thrown = e ?? new OfflineStorageError(failure, 'transaction body failed')
        try { tx.abort() } catch { /* already finished */ }
      },
    )
  })
}

/** Every key of one partition in a store whose key path starts with the partition (arrays sort after strings). */
export const partitionRange = (p: Partition) =>
  IDBKeyRange.bound([p.organizationId, p.deviceUserId], [p.organizationId, p.deviceUserId, []])
