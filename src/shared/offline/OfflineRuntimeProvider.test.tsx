// Offline 3 / 4 · the runtime bound to the device identity: partition lifecycle, local counts, storage failure,
// persistence, triggers, the cached binding following the server — and no backend call of its own.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase/client', () => ({ getSupabase: vi.fn(() => { throw new Error('the runtime must not call the backend itself') }) }))
import { getSupabase } from '../supabase/client'
import { readBinding, saveBinding, type PublicOrganization } from './binding'
import type { Drainer } from './coordinator'
import { openOfflineDb } from './db'
import { OfflineStorageError } from './errors'
import { OfflineRuntimeProvider } from './OfflineRuntimeProvider'
import { useOfflineRuntime, type OfflineRuntime } from './runtime'
import { createOfflineStore } from './store'
import type { Partition } from './types'

const ORG_A = '00000000-0000-4000-8000-0000000000a1', ORG_B = '00000000-0000-4000-8000-0000000000b1'
const USER_1 = '11111111-1111-4111-8111-111111111111', USER_2 = '22222222-2222-4222-8222-222222222222'
const T = '2026-10-15T09:00:00.000Z'
const org = (id: string): PublicOrganization => ({ id, name: `Salão ${id.slice(-2)}`, timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' })

let online = true
Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })

let factory: IDBFactory, latest: OfflineRuntime
const openDb = () => openOfflineDb({ factory })
const see = (r: OfflineRuntime) => { latest = r }
function Probe({ onValue }: { onValue: (r: OfflineRuntime) => void }) {
  const r = useOfflineRuntime()
  useEffect(() => onValue(r))
  return <p data-testid="probe">{r.storage}</p>
}
type Props = Partial<Parameters<typeof OfflineRuntimeProvider>[0]>
function mount(initial: Props) {
  const client = new QueryClient()
  let props: Props = { organization: org(ORG_A), principal: USER_1, bindingSource: 'server', serverBinding: 'bound', storageApi: {}, openDb, ...initial }
  const ui = () => (
    <QueryClientProvider client={client}>
      <OfflineRuntimeProvider {...(props as Parameters<typeof OfflineRuntimeProvider>[0])}><Probe onValue={see} /></OfflineRuntimeProvider>
    </QueryClientProvider>
  )
  const r = render(ui())
  return { ...r, set: (next: Props) => { props = { ...props, ...next }; r.rerender(ui()) } }
}
async function seed(p: Partition, { local = 0, conflict = 0, drafts = 0, lastSync = null as string | null } = {}) {
  const db = await openDb()
  const s = createOfflineStore(db, p)
  for (let i = 0; i < local + conflict; i++) {
    const { commandId } = await s.outbox.put({ commandId: crypto.randomUUID(), type: 'record_service', occurredAt: T, payload: { p_value_minor: 1 } })
    if (i >= local) await s.outbox.updateState(commandId, { state: 'conflict' })
  }
  for (let i = 0; i < drafts; i++) await s.drafts.put({ draftId: crypto.randomUUID(), type: 'expense', capturedAt: T, payload: { p_amount_minor: 1 } })
  if (lastSync) await s.meta.set('lastSuccessfulSyncAt', lastSync)
  db.close()
}
const binding = async (user: string) => { const db = await openDb(); const b = await readBinding(db, user); db.close(); return b }
const ready = () => waitFor(() => expect(latest.storage).toBe('ready'))
const A1 = { organizationId: ORG_A, deviceUserId: USER_1 }

beforeEach(() => { factory = new IDBFactory(); online = true; vi.mocked(getSupabase).mockClear() })
afterEach(() => expect(getSupabase).not.toHaveBeenCalled())

describe('active partition', () => {
  it('none until both the organization and the device principal are known', async () => {
    const { set } = mount({ organization: null, principal: null, serverBinding: 'unknown', bindingSource: null })
    expect([latest.partitionActive, latest.storage, latest.local]).toEqual([false, 'none', null])
    set({ organization: org(ORG_A) })
    expect(latest.partitionActive).toBe(false)                                       // principal still unknown
    set({ principal: USER_1 })
    expect(latest.partitionActive).toBe(true)
    await ready()
  })
  it('the right partition: its own counts, last sync, never another partition\'s', async () => {
    await seed(A1, { local: 2, conflict: 1, drafts: 1, lastSync: '2026-10-15T08:00:00.000Z' })
    await seed({ organizationId: ORG_B, deviceUserId: USER_1 }, { local: 5, drafts: 3 })
    await seed({ organizationId: ORG_A, deviceUserId: USER_2 }, { local: 7 })
    mount({})
    await ready()
    expect(latest.local).toMatchObject({ outboxPending: 3, outboxConflicts: 1, outboxFailed: 0, draftsPending: 1, lastSuccessfulSyncAt: '2026-10-15T08:00:00.000Z',
      foreign: { partitions: 2, unsyncedWork: 15 } })
  })
  it('an organization change drops the old partition at once', async () => {
    await seed(A1, { local: 2 })
    const { set } = mount({})
    await ready()
    expect(latest.local?.outboxPending).toBe(2)
    set({ organization: org(ORG_B) })
    expect(latest.local).toBeNull()                                                   // same render: nothing of A is left
    await ready()
    expect(latest.local?.outboxPending).toBe(0)
  })
  it('a principal change (re-enrollment) drops the old partition at once', async () => {
    await seed(A1, { local: 1, drafts: 2 })
    const { set } = mount({})
    await ready()
    expect(latest.local?.draftsPending).toBe(2)
    set({ principal: USER_2 })
    expect(latest.local).toBeNull()
    await ready()
    expect(latest.local).toMatchObject({ outboxPending: 0, draftsPending: 0, foreign: { partitions: 1, unsyncedWork: 3 } })
  })
  it('an unbound device has no partition and no local data; it only counts the work other bindings left', async () => {
    await seed(A1, { local: 2, drafts: 1 })
    const { set } = mount({})
    await ready()
    set({ organization: null, serverBinding: 'unbound' })
    expect([latest.partitionActive, latest.storage, latest.local, latest.storeAccess]).toEqual([false, 'none', null, null])
    await waitFor(() => expect(latest.heldElsewhere).toBe(3))
  })
})

describe('cached binding', () => {
  it('a server answer that the device is bound stores the public organization data only', async () => {
    mount({})
    await waitFor(async () => expect(await binding(USER_1)).toMatchObject({ deviceUserId: USER_1, organization: org(ORG_A) }))
    const b = (await binding(USER_1))!
    expect(Object.keys(b).sort()).toEqual(['deviceUserId', 'organization', 'verifiedAt'])
    expect(Object.keys(b.organization).sort()).toEqual(['currency_code', 'currency_exponent', 'currency_symbol', 'id', 'name', 'timezone'])
  })
  it('running on the cached binding (server not reached) does not rewrite it; the partition is the cached one', async () => {
    const db = await openDb()
    await saveBinding(db, { deviceUserId: USER_1, organization: org(ORG_A), verifiedAt: T })
    db.close()
    mount({ bindingSource: 'cache', serverBinding: 'unknown' })
    await ready()
    expect([latest.partitionActive, latest.bindingSource]).toEqual([true, 'cache'])
    expect((await binding(USER_1))?.verifiedAt).toBe(T)
  })
  it('a server answer that the device is no longer bound removes the binding and keeps the queued work', async () => {
    await seed(A1, { local: 2 })
    const db = await openDb()
    await saveBinding(db, { deviceUserId: USER_1, organization: org(ORG_A), verifiedAt: T })
    db.close()
    mount({ organization: null, serverBinding: 'unbound' })
    await waitFor(async () => expect(await binding(USER_1)).toBeNull())
    const after = await openDb()
    expect(await createOfflineStore(after, A1).outbox.countPending()).toBe(2)
    after.close()
  })
})

describe('storage', () => {
  it('unavailable IndexedDB is explicit and the app keeps rendering', async () => {
    mount({ openDb: () => Promise.reject(new OfflineStorageError('UNAVAILABLE', 'no IndexedDB')) })
    await waitFor(() => expect(latest.storage).toBe('unavailable'))
    expect(screen.getByTestId('probe').textContent).toBe('unavailable')
    expect(latest.local).toBeNull()
    expect(localStorage.length).toBe(0)                                               // no fallback store
    expect(await act(() => latest.syncNow())).toEqual({ kind: 'blocked', reason: 'storage_unavailable', pending: 0 })
  })
  it('schema-version metadata is initialized when the partition opens', async () => {
    mount({})
    await ready()
    const db = await openDb()
    expect(await createOfflineStore(db, A1).meta.get('storageSchemaVersion')).toBe(db.version)
    db.close()
  })
})

describe('persistence', () => {
  it('reads persisted() without asking; asks only on request, and records the answer', async () => {
    const persist = vi.fn(async () => true)
    mount({ storageApi: { storage: { persisted: async () => false, persist } } })
    await waitFor(() => expect(latest.persistence).toBe('not_granted'))
    expect(persist).not.toHaveBeenCalled()
    expect(await act(() => latest.requestPersistence())).toBe('granted')
    expect(persist).toHaveBeenCalledTimes(1)
    const db = await openDb()
    expect(await createOfflineStore(db, A1).meta.get('storagePersistGranted')).toBe(true)
    db.close()
  })
  it('denied or missing API stays non-fatal', async () => {
    mount({ storageApi: { storage: { persisted: async () => { throw new Error('x') }, persist: async () => false } } })
    await waitFor(() => expect(latest.persistence).toBe('unavailable'))
    expect(await act(() => latest.requestPersistence())).toBe('denied')
    expect(latest.storage).toBe('ready')
  })
})

describe('foreground coordinator', () => {
  it('a manual request with nothing queued returns cleanly', async () => {
    mount({})
    await ready()
    expect(await act(() => latest.syncNow())).toEqual({ kind: 'nothing_to_send' })
    expect(latest.sync).toMatchObject({ status: 'idle', lastTrigger: 'manual' })
  })
  it('without a drainer queued work is never reported as sent', async () => {
    await seed(A1, { local: 1 })
    mount({})
    await ready()
    expect(await act(() => latest.syncNow())).toEqual({ kind: 'blocked', reason: 'sending_not_available', pending: 1 })
    expect(latest.local?.outboxPending).toBe(1)
  })
  it('the partition opening and connectivity returning each run the drainer; results reach onDrained', async () => {
    await seed(A1, { local: 1 })
    const drain = vi.fn<Drainer>(async (store) => {
      for (const i of await store.outbox.listByState('local')) {
        await store.outbox.updateState(i.commandId, { state: 'syncing' })
        await store.outbox.updateState(i.commandId, { state: 'synced', ack: { record_id: crypto.randomUUID() } })
      }
      return { synced: 1, failed: 0, conflicts: 0 }
    })
    const onDrained = vi.fn()
    online = false
    mount({ drain, onDrained })
    await waitFor(() => expect(latest.sync).toMatchObject({ lastTrigger: 'start', status: 'blocked', lastOutcome: { reason: 'offline' } }))
    expect(drain).not.toHaveBeenCalled()
    act(() => { online = true; window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(latest.local?.outboxPending).toBe(0))
    expect(drain).toHaveBeenCalledTimes(1)
    expect(latest.sync).toMatchObject({ lastTrigger: 'reconnect', lastOutcome: { kind: 'drained' } })
    expect(onDrained).toHaveBeenCalledWith({ kind: 'drained', result: { synced: 1, failed: 0, conflicts: 0 } })
  })
  it('the capture snapshot is refreshed only with a server-confirmed binding and a connection', async () => {
    const refreshSnapshot = vi.fn(async () => {})
    const { set } = mount({ refreshSnapshot, bindingSource: 'cache', serverBinding: 'unknown' })
    await ready()
    expect(refreshSnapshot).not.toHaveBeenCalled()
    set({ bindingSource: 'server', serverBinding: 'bound' })
    await waitFor(() => expect(refreshSnapshot).toHaveBeenCalledTimes(1))
  })
})

describe('device sync report (Offline 7)', () => {
  it('online with a server-confirmed binding: reports this partition\'s counts, and again after a local change', async () => {
    const reportSync = vi.fn(async () => ({}))
    mount({ reportSync })
    await waitFor(() => expect(reportSync).toHaveBeenCalledTimes(1))
    expect(reportSync).toHaveBeenLastCalledWith({ days: [], undated: { services: 0, drafts: 0, conflicts: 0 } })
    await waitFor(() => expect(latest.syncReport.at).not.toBeNull())
    const db = await openDb()
    await createOfflineStore(db, A1).outbox.put({ commandId: crypto.randomUUID(), type: 'record_service', occurredAt: '2026-10-15T09:00:00.000Z', payload: { p_value_minor: 1 } })
    db.close()
    await act(() => latest.refresh())
    await waitFor(() => expect(reportSync).toHaveBeenLastCalledWith({ days: [{ day: '2026-10-15', services: 1, drafts: 0, conflicts: 0 }], undated: { services: 0, drafts: 0, conflicts: 0 } }))
  })
  it('offline, or on the cached binding, nothing is reported and nothing is pretended', async () => {
    const reportSync = vi.fn(async () => ({}))
    online = false
    const { set } = mount({ reportSync })
    await ready()
    expect(await act(() => latest.reportSyncNow())).toBe(false)
    set({ bindingSource: 'cache', serverBinding: 'unknown' })
    online = true
    await act(() => new Promise((r) => setTimeout(r, 1000)))
    expect(reportSync).not.toHaveBeenCalled()
    expect(latest.syncReport).toEqual({ at: null, failed: false })
  })
  it('the server time of an answered report is kept as the offset from this phone\'s clock (Offline 8); no answer, no offset', async () => {
    const ahead = 3 * 60 * 60 * 1000                                       // this phone's clock is 3 hours behind the server
    const reportSync = vi.fn(async () => ({ reported_at: new Date(Date.now() + ahead).toISOString() }))
    mount({ reportSync })
    await waitFor(() => expect(latest.syncReport.at).not.toBeNull())
    const db = await openDb()
    const offset = await createOfflineStore(db, A1).meta.get('lastServerTimeOffsetMs')
    expect(Math.abs(offset! - ahead)).toBeLessThan(2000)
    db.close()
  })
  it('a report that cannot reach the server is marked failed, not sent', async () => {
    const reportSync = vi.fn(async () => { throw new Error('Failed to fetch') })
    mount({ reportSync })
    await waitFor(() => expect(latest.syncReport).toEqual({ at: null, failed: true }))
  })
  it('the purge of other bindings is explicit and never touches this partition', async () => {
    await seed(A1, { local: 1 })
    await seed({ organizationId: ORG_B, deviceUserId: USER_2 }, { local: 2, drafts: 1 })
    mount({})
    await ready()
    expect(latest.local?.foreign).toEqual({ partitions: 1, unsyncedWork: 3 })
    await act(() => latest.discardForeign())
    await waitFor(() => expect(latest.local?.foreign).toEqual({ partitions: 0, unsyncedWork: 0 }))
    expect(latest.local?.outboxPending).toBe(1)
  })
})

