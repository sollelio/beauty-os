// Offline 3 · local status of the active partition: counts and dates only; other partitions counted apart.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { openOfflineDb } from './db'
import { readLocalStatus } from './status'
import { createOfflineStore } from './store'
import type { Partition } from './types'

const A1: Partition = { organizationId: '00000000-0000-4000-8000-0000000000a1', deviceUserId: '11111111-1111-4111-8111-111111111111' }
const B2: Partition = { organizationId: '00000000-0000-4000-8000-0000000000b1', deviceUserId: '22222222-2222-4222-8222-222222222222' }
const T = '2026-10-15T09:00:00.000Z'
const id = () => crypto.randomUUID()

let db: IDBDatabase
beforeEach(async () => { db = await openOfflineDb({ factory: new IDBFactory() }) })
async function seed(p: Partition, states: ('local' | 'failed' | 'conflict' | 'synced')[], drafts = 0) {
  const s = createOfflineStore(db, p)
  for (const st of states) {
    const { commandId } = await s.outbox.put({ commandId: id(), type: 'record_service', occurredAt: T, payload: { p_value_minor: 1 } })
    if (st === 'local') continue
    if (st !== 'conflict') await s.outbox.updateState(commandId, { state: 'syncing' })
    await s.outbox.updateState(commandId, { state: st })
  }
  for (let i = 0; i < drafts; i++) await s.drafts.put({ draftId: id(), type: 'advance', capturedAt: T, payload: { p_amount_minor: 1 } })
  return s
}

describe('local status', () => {
  it('counts the active partition only; other partitions are reported apart', async () => {
    const s = await seed(A1, ['local', 'local', 'failed', 'conflict', 'synced'], 2)
    await s.meta.set('lastSuccessfulSyncAt', '2026-10-15T08:00:00.000Z')
    await seed(B2, ['local', 'local', 'local'], 1)
    expect(await readLocalStatus(db, A1)).toEqual({
      schemaVersion: db.version, outboxPending: 4, outboxFailed: 1, outboxConflicts: 1, draftsPending: 2,
      lastSuccessfulSyncAt: '2026-10-15T08:00:00.000Z', foreign: { partitions: 1, unsyncedWork: 4 },
    })
  })
  it('an empty partition reads as zeros, with no last sync', async () => {
    expect(await readLocalStatus(db, A1)).toMatchObject({ outboxPending: 0, draftsPending: 0, lastSuccessfulSyncAt: null, foreign: { partitions: 0, unsyncedWork: 0 } })
  })
  it('keeps storageSchemaVersion coherent with the open database, writing meta only', async () => {
    const s = createOfflineStore(db, A1)
    expect(await s.meta.get('storageSchemaVersion')).toBeNull()
    await readLocalStatus(db, A1)
    expect(await s.meta.get('storageSchemaVersion')).toBe(db.version)
    await s.meta.set('storageSchemaVersion', db.version + 5)                     // stale or foreign value
    await readLocalStatus(db, A1)
    expect(await s.meta.get('storageSchemaVersion')).toBe(db.version)
    expect(await s.outbox.list()).toEqual([])
    expect(await s.drafts.list()).toEqual([])
  })
})
