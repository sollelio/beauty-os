// Partitions other than the active one (ADR-0010 §6 quarantine): after an organization change, an unbind or a
// re-enrollment, records of the previous binding stay on the device. They are never read by a store of the new
// binding and never synchronized under it; here they can only be counted, and removed by an explicit purge. A purge
// that would discard work not yet on the server (unsynced commands, unconfirmed drafts) requires the caller to say so —
// the decision belongs to a person (ADR-0010 §10), the user-facing review comes in a later slice.
import { partitionRange, promised, STORES, transact } from './db'
import { OfflineStorageError } from './errors'
import { assertPartition } from './validate'
import type { DraftState, OutboxState, Partition } from './types'

export type PartitionSummary = Partition & {
  outbox: number; outboxUnsynced: number
  drafts: number; draftsPending: number
  snapshot: number; meta: number
}

const id = (p: Partition) => `${p.organizationId}|${p.deviceUserId}`
const same = (a: Partition, b: Partition) => a.organizationId === b.organizationId && a.deviceUserId === b.deviceUserId

/** Every partition with records on this device, with counts only (no content). */
export function listPartitions(db: IDBDatabase): Promise<PartitionSummary[]> {
  return transact(db, [...STORES], 'readonly', async (tx) => {
    const found = new Map<string, PartitionSummary>()
    const entry = (r: Partition) => {
      const k = id(r)
      if (!found.has(k)) found.set(k, { organizationId: r.organizationId, deviceUserId: r.deviceUserId, outbox: 0, outboxUnsynced: 0, drafts: 0, draftsPending: 0, snapshot: 0, meta: 0 })
      return found.get(k)!
    }
    for (const r of (await promised(tx.objectStore('outbox').getAll())) as (Partition & { state: OutboxState })[]) {
      const e = entry(r); e.outbox++; if (r.state !== 'synced') e.outboxUnsynced++
    }
    for (const r of (await promised(tx.objectStore('drafts').getAll())) as (Partition & { state: DraftState })[]) {
      const e = entry(r); e.drafts++; if (r.state === 'draft') e.draftsPending++
    }
    for (const r of (await promised(tx.objectStore('snapshot').getAllKeys())) as unknown as [string, string, string][]) {
      entry({ organizationId: r[0], deviceUserId: r[1] }).snapshot++
    }
    for (const r of (await promised(tx.objectStore('meta').getAllKeys())) as unknown as [string, string, string][]) {
      entry({ organizationId: r[0], deviceUserId: r[1] }).meta++
    }
    return [...found.values()]
  })
}

/** Partitions that are not the active one; with no active binding (unbound device) every partition is foreign. */
export async function findForeignPartitions(db: IDBDatabase, active: Partition | null): Promise<PartitionSummary[]> {
  const a = active ? assertPartition(active) : null
  return (await listPartitions(db)).filter((p) => !a || !same(p, a))
}

export type PurgeResult = { outbox: number; drafts: number; snapshot: number; meta: number }

/**
 * Removes every record of one partition, in one transaction. Refused with UNSYNCED_WORK (nothing removed) while the
 * partition holds unsynced commands or pending drafts, unless `discardUnsyncedWork` is set by an explicit decision.
 */
export function purgePartition(db: IDBDatabase, partition: Partition, { discardUnsyncedWork = false } = {}): Promise<PurgeResult> {
  const p = assertPartition(partition)
  const range = partitionRange(p)
  return transact(db, [...STORES], 'readwrite', async (tx) => {
    const outbox = (await promised(tx.objectStore('outbox').getAll(range))) as { state: OutboxState }[]
    const drafts = (await promised(tx.objectStore('drafts').getAll(range))) as { state: DraftState }[]
    const unsynced = outbox.filter((r) => r.state !== 'synced').length, pending = drafts.filter((r) => r.state === 'draft').length
    if ((unsynced > 0 || pending > 0) && !discardUnsyncedWork) {
      throw new OfflineStorageError('UNSYNCED_WORK', 'this partition holds work that is not on the server', { detail: { outboxUnsynced: unsynced, draftsPending: pending } })
    }
    const result: PurgeResult = {
      outbox: outbox.length, drafts: drafts.length,
      snapshot: await promised(tx.objectStore('snapshot').count(range)),
      meta: await promised(tx.objectStore('meta').count(range)),
    }
    for (const store of STORES) await promised(tx.objectStore(store).delete(range))
    return result
  })
}
