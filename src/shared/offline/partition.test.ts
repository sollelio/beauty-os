// Offline 2 · foreign partitions and purge (ADR-0010 §6 quarantine). In-memory IndexedDB.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { openOfflineDb } from './db'
import { OfflineStorageError } from './errors'
import { findForeignPartitions, listPartitions, purgePartition } from './partition'
import { readBinding, saveBinding } from './binding'
import { createOfflineStore } from './store'
import type { Partition } from './types'

const ORG_A = '00000000-0000-4000-8000-0000000000a1', ORG_B = '00000000-0000-4000-8000-0000000000b1'
const USER_1 = '11111111-1111-4111-8111-111111111111', USER_2 = '22222222-2222-4222-8222-222222222222'
const A1: Partition = { organizationId: ORG_A, deviceUserId: USER_1 }
const A2: Partition = { organizationId: ORG_A, deviceUserId: USER_2 }       // re-enrolled: a new principal
const B2: Partition = { organizationId: ORG_B, deviceUserId: USER_2 }
const id = () => crypto.randomUUID()
const T = '2026-10-15T09:00:00.000Z'

let db: IDBDatabase
async function fill(p: Partition, { unsynced = 1, synced = 0, drafts = 0 } = {}) {
  const s = createOfflineStore(db, p)
  for (let i = 0; i < unsynced + synced; i++) {
    const commandId = id()
    await s.outbox.put({ commandId, type: 'record_service', occurredAt: T, payload: { p_value_minor: 100 } })
    if (i >= unsynced) {
      await s.outbox.updateState(commandId, { state: 'syncing' })
      await s.outbox.updateState(commandId, { state: 'synced', ack: { record_id: id() } })
    }
  }
  for (let i = 0; i < drafts; i++) await s.drafts.put({ draftId: id(), type: 'expense', capturedAt: T, payload: { p_amount_minor: 100 } })
  await s.snapshot.replace('services', { version: 1, fetchedAt: T, data: [] })
  await s.meta.set('lastServerTimeOffsetMs', 0)
  return s
}
const sorted = (xs: Partition[]) => xs.map((x) => `${x.organizationId}|${x.deviceUserId}`).sort()

beforeEach(async () => { db = await openOfflineDb({ factory: new IDBFactory() }) })

describe('foreign partitions', () => {
  it('are detected and counted, without content', async () => {
    await fill(A1, { unsynced: 2, synced: 1, drafts: 1 })
    await fill(A2, { unsynced: 0, synced: 1 })
    await fill(B2, { unsynced: 1 })
    const foreign = await findForeignPartitions(db, A2)
    expect(sorted(foreign)).toEqual(sorted([A1, B2]))
    expect(foreign.find((x) => x.deviceUserId === USER_1)).toEqual({ ...A1, outbox: 3, outboxUnsynced: 2, drafts: 1, draftsPending: 1, snapshot: 1, meta: 1 })
    expect(Object.keys(foreign[0]!).sort()).toEqual(['deviceUserId', 'drafts', 'draftsPending', 'meta', 'organizationId', 'outbox', 'outboxUnsynced', 'snapshot'])
    expect(sorted(await listPartitions(db))).toEqual(sorted([A1, A2, B2]))
  })
  it('an unbound device (no active partition) treats every partition as foreign', async () => {
    await fill(A1); await fill(B2)
    expect(sorted(await findForeignPartitions(db, null))).toEqual(sorted([A1, B2]))
  })
  it('the new binding\'s store never reads the previous binding\'s work', async () => {
    await fill(A1, { unsynced: 2, drafts: 1 })
    const now = createOfflineStore(db, A2)
    expect(await now.outbox.list()).toEqual([])
    expect(await now.outbox.countPending()).toBe(0)
    expect(await now.drafts.list()).toEqual([])
  })
})

describe('purge', () => {
  it('refuses to discard unsynced work without an explicit decision, and removes nothing', async () => {
    await fill(A1, { unsynced: 1, drafts: 2 })
    let err: unknown
    try { await purgePartition(db, A1) } catch (e) { err = e }
    expect(err).toBeInstanceOf(OfflineStorageError)
    expect((err as OfflineStorageError).code).toBe('UNSYNCED_WORK')
    expect((err as OfflineStorageError).detail).toEqual({ outboxUnsynced: 1, draftsPending: 2 })
    expect((await listPartitions(db))[0]).toMatchObject({ outbox: 1, drafts: 2, snapshot: 1, meta: 1 })
  })
  it('with the decision, removes that partition only', async () => {
    await fill(A1, { unsynced: 1, drafts: 1 })
    await fill(A2, { unsynced: 1 })
    await fill(B2, { unsynced: 1 })
    expect(await purgePartition(db, A1, { discardUnsyncedWork: true })).toEqual({ outbox: 1, drafts: 1, snapshot: 1, meta: 1, binding: 0 })
    expect(sorted(await listPartitions(db))).toEqual(sorted([A2, B2]))
    expect(await createOfflineStore(db, A2).outbox.countPending()).toBe(1)
  })
  it('a partition with only synced commands and re-fetchable data can be purged without the decision', async () => {
    await fill(A1, { unsynced: 0, synced: 2 })
    expect(await purgePartition(db, A1)).toEqual({ outbox: 2, drafts: 0, snapshot: 1, meta: 1, binding: 0 })
    expect(await listPartitions(db)).toEqual([])
  })
})

describe('purge and the cached binding', () => {
  const org = (id: string) => ({ id, name: 'Salão', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' })
  it('removes the binding of the purged partition only when it names that organization', async () => {
    await fill(A1, { unsynced: 0 })
    await saveBinding(db, { deviceUserId: USER_1, organization: org(ORG_A), verifiedAt: T })
    await saveBinding(db, { deviceUserId: USER_2, organization: org(ORG_B), verifiedAt: T })
    expect((await purgePartition(db, A1)).binding).toBe(1)
    expect(await readBinding(db, USER_1)).toBeNull()
    expect((await purgePartition(db, A2)).binding).toBe(0)                 // USER_2 is bound to ORG_B, not ORG_A
    expect(await readBinding(db, USER_2)).not.toBeNull()
  })
})

