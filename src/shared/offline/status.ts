// The active partition's local status, as counts and dates only (no record content), read through the Offline 2
// store. Opening a partition also keeps its storageSchemaVersion coherent with the open database (meta only; no
// business record is written).
import { findForeignPartitions } from './partition'
import { createOfflineStore } from './store'
import type { Partition } from './types'

export type LocalStatus = {
  schemaVersion: number
  outboxPending: number             // not yet on the server (local, syncing, failed, conflict)
  outboxFailed: number
  outboxConflicts: number
  draftsPending: number             // drafts waiting for the online PIN confirmation
  lastSuccessfulSyncAt: string | null
  foreign: { partitions: number; unsyncedWork: number }   // other bindings' data on this device: counted, never shown
}

export async function readLocalStatus(db: IDBDatabase, partition: Partition): Promise<LocalStatus> {
  const store = createOfflineStore(db, partition)
  if ((await store.meta.get('storageSchemaVersion')) !== db.version) await store.meta.recordSchemaVersion()
  const byState = await store.outbox.countByState()
  const foreign = await findForeignPartitions(db, store.partition)
  return {
    schemaVersion: db.version,
    outboxPending: byState.local + byState.syncing + byState.failed + byState.conflict,
    outboxFailed: byState.failed,
    outboxConflicts: byState.conflict,
    draftsPending: await store.drafts.countPending(),
    lastSuccessfulSyncAt: await store.meta.get('lastSuccessfulSyncAt'),
    foreign: { partitions: foreign.length, unsyncedWork: foreign.reduce((n, p) => n + p.outboxUnsynced + p.draftsPending, 0) },
  }
}
