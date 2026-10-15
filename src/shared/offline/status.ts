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
  draftsReview: number              // of those, the ones the server did not accept (need review)
  lastSuccessfulSyncAt: string | null
  foreign: { partitions: number; unsyncedWork: number }   // other bindings' data on this device: counted, never shown
}

async function draftCounts(store: ReturnType<typeof createOfflineStore>) {
  const pending = (await store.drafts.list()).filter((d) => d.state === 'draft')
  return { draftsPending: pending.length, draftsReview: pending.filter((d) => (d.payload as { review?: unknown }).review).length }
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
    ...(await draftCounts(store)),
    lastSuccessfulSyncAt: await store.meta.get('lastSuccessfulSyncAt'),
    foreign: { partitions: foreign.length, unsyncedWork: foreign.reduce((n, p) => n + p.outboxUnsynced + p.draftsPending, 0) },
  }
}
