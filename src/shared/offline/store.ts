// The storage API for the active partition (ADR-0010 §6). Every operation is asynchronous and fails by rejecting with
// an OfflineStorageError (invalid input included). A store is bound to one partition when it is created, so
// its reads can only ever return that partition's records; other partitions are reached only through the explicit
// detection and purge functions in ./partition. Nothing calls this in production yet (Offline 4 / 6 will).
import { partitionRange, promised, transact, type StoreName } from './db'
import { OfflineStorageError } from './errors'
import {
  DRAFT_STATES, DRAFT_TYPES, META_KEYS, OUTBOX_STATES, OUTBOX_TYPES, SNAPSHOT_GROUPS,
  type Draft, type DraftState, type MetaKey, type MetaRecord, type MetaValues, type NewDraft,
  type NewOutboxItem, type OutboxItem, type OutboxState, type OutboxStatePatch, type Partition, type SnapshotGroup,
  type SnapshotInput, type SnapshotMeta, type SnapshotRecord,
} from './types'
import {
  assertInPartition, assertIso, assertOneOf, assertPartition, assertSafeData, assertSafeObject, assertUuid, isIsoInstant, isUuid, sameData,
} from './validate'
import type { PersistResult } from './persistence'

const malformed = (message: string) => new OfflineStorageError('MALFORMED_RECORD', message)

/**
 * Outbox state changes (ADR-0010 §9): a command goes local → syncing → synced; a transient failure is `failed` and
 * may be retried; a domain or security rejection is `conflict` and leaves it only by an explicit human retry (→ local).
 * Synced is final. Staying in the same state (e.g. failed with one more attempt) is allowed, except for synced.
 */
const OUTBOX_NEXT: Record<OutboxState, readonly OutboxState[]> = {
  local: ['local', 'syncing', 'conflict'],
  syncing: ['syncing', 'synced', 'failed', 'conflict', 'local'],
  failed: ['failed', 'syncing', 'conflict', 'local'],
  conflict: ['conflict', 'local'],
  synced: [],
}
/** Not yet on the server: everything except synced (a conflict is unsynced work too). */
export const UNSYNCED_OUTBOX: readonly OutboxState[] = ['local', 'syncing', 'failed', 'conflict']
/** A draft is pending until it has become a record through the online confirmation. */
export const PENDING_DRAFT: DraftState = 'draft'

const optionalDeviceId = (v: unknown) => {
  if (v === undefined || v === null) return null
  return assertUuid('deviceId', v)
}

function checkOutbox(r: unknown, p: Partition): OutboxItem {
  const x = r as OutboxItem
  assertInPartition(x, p, 'outbox item')
  if (!isUuid(x.commandId) || !(OUTBOX_TYPES as readonly string[]).includes(x.type) || !(OUTBOX_STATES as readonly string[]).includes(x.state)
      || !isIsoInstant(x.occurredAt) || !isIsoInstant(x.createdAt) || !Number.isSafeInteger(x.attempts) || x.attempts < 0
      || !(x.nextAttemptAt === null || isIsoInstant(x.nextAttemptAt)) || !(x.lastError === null || typeof x.lastError === 'string')
      || !(x.deviceId === null || isUuid(x.deviceId))) {
    throw malformed('stored outbox item does not match its contract')
  }
  assertSafeObject(x.payload, 'outbox.payload')
  if (x.ack !== null) assertSafeObject(x.ack, 'outbox.ack')
  return x
}

function checkDraft(r: unknown, p: Partition): Draft {
  const x = r as Draft
  assertInPartition(x, p, 'draft')
  if (!isUuid(x.draftId) || !(DRAFT_TYPES as readonly string[]).includes(x.type) || !(DRAFT_STATES as readonly string[]).includes(x.state)
      || !isIsoInstant(x.capturedAt) || !isIsoInstant(x.createdAt) || !isIsoInstant(x.updatedAt) || !(x.deviceId === null || isUuid(x.deviceId))) {
    throw malformed('stored draft does not match its contract')
  }
  assertSafeObject(x.payload, 'draft.payload')
  return x
}

function checkSnapshot(r: unknown, p: Partition): SnapshotRecord {
  const x = r as SnapshotRecord
  assertInPartition(x, p, 'snapshot')
  if (!(SNAPSHOT_GROUPS as readonly string[]).includes(x.group) || !Number.isSafeInteger(x.version) || x.version < 1 || !isIsoInstant(x.fetchedAt)) {
    throw malformed('stored snapshot does not match its contract')
  }
  assertSafeData(x.data, `snapshot.${x.group}`)
  return x
}

function checkMetaValue<K extends MetaKey>(key: K, value: unknown): MetaValues[K] {
  const ok = key === 'lastSuccessfulSyncAt' ? isIsoInstant(value)
    : key === 'lastServerTimeOffsetMs' ? Number.isSafeInteger(value)
    : key === 'storageSchemaVersion' ? Number.isSafeInteger(value) && (value as number) >= 1
    : typeof value === 'boolean'
  if (!ok) throw malformed(`meta ${key} has an invalid value`)
  return value as MetaValues[K]
}

const byCreated = <T extends { createdAt: string }>(id: (x: T) => string) => (a: T, b: T) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0

export type OfflineStore = ReturnType<typeof createOfflineStore>

export function createOfflineStore(db: IDBDatabase, partition: Partition, now: () => string = () => new Date().toISOString()) {
  const p = assertPartition(partition)
  const key = (id: string) => [p.organizationId, p.deviceUserId, id]
  const inPartition = IDBKeyRange.only([p.organizationId, p.deviceUserId])
  const read = <T>(store: StoreName, body: (s: IDBObjectStore) => Promise<T>) =>
    transact(db, [store], 'readonly', (tx) => body(tx.objectStore(store)))
  const write = <T>(store: StoreName, body: (s: IDBObjectStore) => Promise<T>) =>
    transact(db, [store], 'readwrite', (tx) => body(tx.objectStore(store)))
  const stamp = () => assertIso('clock', now())

  const outbox = {
    /**
     * Stores a newly captured command (state local). The command id is generated once, at capture (ADR-0010 §9):
     * putting the same command again is a no-op that returns the stored item, and the same id with a different type,
     * payload or capture time is RECORD_CONFLICT — the stored command is never replaced.
     */
    put: async (item: NewOutboxItem) => {
      const commandId = assertUuid('commandId', item.commandId)
      const type = assertOneOf('type', item.type, OUTBOX_TYPES)
      const payload = assertSafeObject(item.payload, 'outbox.payload')
      const occurredAt = assertIso('occurredAt', item.occurredAt)
      const deviceId = optionalDeviceId(item.deviceId)
      const createdAt = stamp()
      return write('outbox', async (s) => {
        const existing = await promised(s.get(key(commandId)))
        if (existing) {
          const x = checkOutbox(existing, p)
          if (x.type !== type || x.occurredAt !== occurredAt || !sameData(x.payload, payload)) {
            throw new OfflineStorageError('RECORD_CONFLICT', 'this command id is already stored with different content')
          }
          return x
        }
        const record: OutboxItem = { ...p, commandId, deviceId, type, payload, occurredAt, createdAt,
          state: 'local', attempts: 0, nextAttemptAt: null, lastError: null, ack: null }
        await promised(s.add(record))
        return record
      })
    },
    get: (commandId: string) => read('outbox', async (s) => {
      const r = await promised(s.get(key(assertUuid('commandId', commandId))))
      return r === undefined ? null : checkOutbox(r, p)
    }),
    /** This partition's commands, oldest first (the drain order). */
    list: () => read('outbox', async (s) =>
      (await promised(s.index('partition').getAll(inPartition))).map((r) => checkOutbox(r, p)).sort(byCreated((x) => x.commandId))),
    listByState: (state: OutboxState) => read('outbox', async (s) => {
      const st = assertOneOf('state', state, OUTBOX_STATES)
      const rows = await promised(s.index('partitionState').getAll(IDBKeyRange.only([p.organizationId, p.deviceUserId, st])))
      return rows.map((r) => checkOutbox(r, p)).sort(byCreated((x) => x.commandId))
    }),
    /** Changes state (and the retry fields) in one transaction; the command itself is never changed. */
    updateState: async (commandId: string, patch: OutboxStatePatch) => {
      const id = assertUuid('commandId', commandId)
      const state = assertOneOf('state', patch.state, OUTBOX_STATES)
      if (patch.attempts !== undefined && (!Number.isSafeInteger(patch.attempts) || patch.attempts < 0)) throw malformed('attempts must be a non-negative integer')
      if (patch.nextAttemptAt !== undefined && patch.nextAttemptAt !== null) assertIso('nextAttemptAt', patch.nextAttemptAt)
      if (patch.lastError !== undefined && patch.lastError !== null && (typeof patch.lastError !== 'string' || patch.lastError.length > 500)) {
        throw malformed('lastError must be a short string')
      }
      const ack = patch.ack === undefined || patch.ack === null ? patch.ack : assertSafeObject(patch.ack, 'outbox.ack')
      return write('outbox', async (s) => {
        const existing = await promised(s.get(key(id)))
        if (existing === undefined) throw new OfflineStorageError('NOT_FOUND', 'no such command in this partition')
        const x = checkOutbox(existing, p)
        if (!OUTBOX_NEXT[x.state].includes(state)) throw new OfflineStorageError('INVALID_TRANSITION', `${x.state} → ${state} is not allowed`)
        const next: OutboxItem = {
          ...x, state,
          attempts: patch.attempts ?? x.attempts,
          nextAttemptAt: patch.nextAttemptAt === undefined ? x.nextAttemptAt : patch.nextAttemptAt,
          lastError: patch.lastError === undefined ? x.lastError : patch.lastError,
          ack: ack === undefined ? x.ack : ack,
        }
        await promised(s.put(next))
        return next
      })
    },
    delete: (commandId: string) => write('outbox', async (s) => { await promised(s.delete(key(assertUuid('commandId', commandId)))) }),
    countByState: () => read('outbox', async (s) => {
      const counts = Object.fromEntries(OUTBOX_STATES.map((st) => [st, 0])) as Record<OutboxState, number>
      for (const st of OUTBOX_STATES) counts[st] = await promised(s.index('partitionState').count(IDBKeyRange.only([p.organizationId, p.deviceUserId, st])))
      return counts
    }),
    /** Commands of this partition not yet on the server (local, syncing, failed and conflict). */
    countPending: async () => {
      const c = await outbox.countByState()
      return UNSYNCED_OUTBOX.reduce((n, st) => n + c[st], 0)
    },
  }

  const drafts = {
    /** Creates or updates a draft. Its type is fixed once stored; a submitted draft does not go back to draft. */
    put: async (input: NewDraft) => {
      const draftId = assertUuid('draftId', input.draftId)
      const type = assertOneOf('type', input.type, DRAFT_TYPES)
      const state = assertOneOf('state', input.state ?? 'draft', DRAFT_STATES)
      const payload = assertSafeObject(input.payload, 'draft.payload')
      const capturedAt = assertIso('capturedAt', input.capturedAt)
      const deviceId = optionalDeviceId(input.deviceId)
      const t = stamp()
      return write('drafts', async (s) => {
        const existing = await promised(s.get(key(draftId)))
        const x = existing === undefined ? null : checkDraft(existing, p)
        if (x && x.type !== type) throw new OfflineStorageError('RECORD_CONFLICT', 'a draft keeps its type')
        if (x && x.state === 'submitted' && state !== 'submitted') throw new OfflineStorageError('INVALID_TRANSITION', 'a submitted draft does not go back to draft')
        const record: Draft = { ...p, draftId, deviceId, type, payload, capturedAt, state, createdAt: x?.createdAt ?? t, updatedAt: t }
        await promised(s.put(record))
        return record
      })
    },
    get: (draftId: string) => read('drafts', async (s) => {
      const r = await promised(s.get(key(assertUuid('draftId', draftId))))
      return r === undefined ? null : checkDraft(r, p)
    }),
    list: () => read('drafts', async (s) =>
      (await promised(s.index('partition').getAll(inPartition))).map((r) => checkDraft(r, p)).sort(byCreated((x) => x.draftId))),
    delete: (draftId: string) => write('drafts', async (s) => { await promised(s.delete(key(assertUuid('draftId', draftId)))) }),
    countPending: async () => (await drafts.list()).filter((d) => d.state === PENDING_DRAFT).length,
  }

  const snapshot = {
    /** Replaces one group in a single write: a reader sees the old group or the new one, never a mix. */
    replace: async (group: SnapshotGroup, input: SnapshotInput) => {
      const g = assertOneOf('group', group, SNAPSHOT_GROUPS)
      if (!Number.isSafeInteger(input.version) || input.version < 1) throw malformed('snapshot version must be a positive integer')
      const record: SnapshotRecord = { ...p, group: g, version: input.version, fetchedAt: assertIso('fetchedAt', input.fetchedAt),
        data: assertSafeData(input.data, `snapshot.${g}`) }
      return write('snapshot', async (s) => { await promised(s.put(record)); return record })
    },
    get: (group: SnapshotGroup) => read('snapshot', async (s) => {
      const r = await promised(s.get(key(assertOneOf('group', group, SNAPSHOT_GROUPS))))
      return r === undefined ? null : checkSnapshot(r, p)
    }),
    listMeta: () => read('snapshot', async (s) =>
      (await promised(s.index('partition').getAll(inPartition))).map((r): SnapshotMeta => {
        const x = checkSnapshot(r, p)
        return { group: x.group, version: x.version, fetchedAt: x.fetchedAt, size: Array.isArray(x.data) ? x.data.length : null }
      }).sort((a, b) => a.group.localeCompare(b.group))),
    /** Snapshots are re-fetchable copies: clearing them never needs a decision about unsynced work. */
    clear: () => write('snapshot', async (s) => { await promised(s.delete(partitionRange(p))) }),
  }

  const meta = {
    get: <K extends MetaKey>(k: K) => read('meta', async (s) => {
      const r = (await promised(s.get(key(assertOneOf('key', k, META_KEYS))))) as MetaRecord<K> | undefined
      if (r === undefined) return null
      assertInPartition(r, p, 'meta')
      return checkMetaValue(k, r.value)
    }),
    set: async <K extends MetaKey>(k: K, value: MetaValues[K]) => {
      const record: MetaRecord<K> = { ...p, key: assertOneOf('key', k, META_KEYS) as K, value: checkMetaValue(k, value), updatedAt: stamp() }
      return write('meta', async (s) => { await promised(s.put(record)) })
    },
    all: () => read('meta', async (s) => {
      const out: Partial<MetaValues> = {}
      for (const r of (await promised(s.index('partition').getAll(inPartition))) as MetaRecord[]) {
        assertInPartition(r, p, 'meta')
        if ((META_KEYS as readonly string[]).includes(r.key)) (out as Record<string, unknown>)[r.key] = checkMetaValue(r.key, r.value)
      }
      return out
    }),
    /** The schema version this partition was last written with (the open database's version). */
    recordSchemaVersion: () => meta.set('storageSchemaVersion', db.version),
    /** Records the outcome of an explicit persistence request; only `granted` is true, and it is no durability promise. */
    recordPersistResult: (result: PersistResult) => meta.set('storagePersistGranted', result === 'granted'),
  }

  return { partition: p, outbox, drafts, snapshot, meta }
}
