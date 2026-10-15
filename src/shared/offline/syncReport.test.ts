// Offline 7 · the device sync report: this partition's counts per organization day, unknown times kept as undated.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { openOfflineDb } from './db'
import { createOfflineStore, type OfflineStore } from './store'
import { buildSyncReport } from './syncReport'

const A = { organizationId: '00000000-0000-4000-8000-0000000000a1', deviceUserId: '11111111-1111-4111-8111-111111111111' }
const OTHER = { organizationId: '00000000-0000-4000-8000-0000000000b1', deviceUserId: '22222222-2222-4222-8222-222222222222' }
let db: IDBDatabase, s: OfflineStore
beforeEach(async () => { db = await openOfflineDb({ factory: new IDBFactory() }); s = createOfflineStore(db, A) })
const queue = (store: OfflineStore, occurredAt: string) =>
  store.outbox.put({ commandId: crypto.randomUUID(), type: 'record_service', occurredAt, payload: { p_value_minor: 1 } })

describe('sync report', () => {
  it('per day of the organization time zone: unsent services, drafts waiting for a PIN, items to review', async () => {
    await queue(s, '2026-10-14T22:30:00.000Z')                                  // 23:30 in Luanda: still the 14th
    await queue(s, '2026-10-14T23:30:00.000Z')                                  // 00:30 in Luanda: the 15th
    const c = await queue(s, '2026-10-15T09:00:00.000Z')
    await s.outbox.updateState(c.commandId, { state: 'conflict', lastError: 'PERIOD_APPROVED' })
    const synced = await queue(s, '2026-10-13T09:00:00.000Z')
    await s.outbox.updateState(synced.commandId, { state: 'syncing' }); await s.outbox.updateState(synced.commandId, { state: 'synced' })
    await s.drafts.put({ draftId: crypto.randomUUID(), type: 'expense', capturedAt: '2026-10-15T10:00:00.000Z', payload: { form: {}, review: null } })
    await s.drafts.put({ draftId: crypto.randomUUID(), type: 'advance', capturedAt: '2026-10-12T10:00:00.000Z', payload: { form: {}, review: { code: 'PERIOD_CLOSED', at: '2026-10-15T10:00:00.000Z' } } })
    expect(await buildSyncReport(s, 'Africa/Luanda')).toEqual({
      days: [
        { day: '2026-10-12', services: 0, drafts: 0, conflicts: 1 },
        { day: '2026-10-14', services: 1, drafts: 0, conflicts: 0 },
        { day: '2026-10-15', services: 1, drafts: 1, conflicts: 1 },
      ],
      undated: { services: 0, drafts: 0, conflicts: 0 },
    })
  })
  it('only this partition — another binding\'s work on the device is never reported as this device\'s', async () => {
    await queue(createOfflineStore(db, OTHER), '2026-10-14T09:00:00.000Z')
    expect(await buildSyncReport(s, 'Africa/Luanda')).toEqual({ days: [], undated: { services: 0, drafts: 0, conflicts: 0 } })
  })
  it('nothing held: an empty report', async () => {
    expect(await buildSyncReport(s, 'Africa/Luanda')).toEqual({ days: [], undated: { services: 0, drafts: 0, conflicts: 0 } })
  })
})
