// Offline 3 · the runtime bound to the device identity: partition lifecycle, local counts, storage failure,
// persistence, triggers — and no backend call at all.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase/client', () => ({ getSupabase: vi.fn(() => { throw new Error('Offline 3 must not call the backend') }) }))
import { getSupabase } from '../supabase/client'
import { openOfflineDb } from './db'
import { OfflineStorageError } from './errors'
import { OfflineRuntimeProvider, type PrincipalWatcher } from './OfflineRuntimeProvider'
import { useOfflineRuntime, type OfflineRuntime } from './runtime'
import { createOfflineStore } from './store'
import type { Partition } from './types'

const ORG_A = '00000000-0000-4000-8000-0000000000a1', ORG_B = '00000000-0000-4000-8000-0000000000b1'
const USER_1 = '11111111-1111-4111-8111-111111111111', USER_2 = '22222222-2222-4222-8222-222222222222'
const T = '2026-10-15T09:00:00.000Z'

let online = true
Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })

let factory: IDBFactory, latest: OfflineRuntime
const openDb = () => openOfflineDb({ factory })
function principal(initial: string | null) {
  let listener: ((v: string | null) => void) | undefined, value = initial
  const watch: PrincipalWatcher = (onChange) => { listener = onChange; onChange(value); return () => { listener = undefined } }
  return { watch, set: (v: string | null) => { value = v; act(() => listener?.(v)) } }
}
const see = (r: OfflineRuntime) => { latest = r }
function Probe({ onValue }: { onValue: (r: OfflineRuntime) => void }) {
  const r = useOfflineRuntime()
  useEffect(() => onValue(r))
  return <p data-testid="probe">{r.storage}</p>
}
function mount(org: string | null, watch: PrincipalWatcher, over: Partial<Parameters<typeof OfflineRuntimeProvider>[0]> = {}) {
  const client = new QueryClient()
  const ui = (o: string | null) => (
    <QueryClientProvider client={client}>
      <OfflineRuntimeProvider organizationId={o} watchPrincipal={watch} openDb={openDb} storageApi={{}} {...over}><Probe onValue={see} /></OfflineRuntimeProvider>
    </QueryClientProvider>
  )
  const r = render(ui(org))
  return { ...r, setOrg: (o: string | null) => r.rerender(ui(o)) }
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
const ready = () => waitFor(() => expect(latest.storage).toBe('ready'))

beforeEach(() => { factory = new IDBFactory(); online = true; vi.mocked(getSupabase).mockClear() })
afterEach(() => expect(getSupabase).not.toHaveBeenCalled())

describe('active partition', () => {
  it('none until both the organization and the device principal are known', async () => {
    const p = principal(null)
    const { setOrg } = mount(null, p.watch)
    expect([latest.partitionActive, latest.storage, latest.local]).toEqual([false, 'none', null])
    setOrg(ORG_A)
    expect(latest.partitionActive).toBe(false)                                       // principal still unknown
    p.set(USER_1)
    expect(latest.partitionActive).toBe(true)
    await ready()
  })
  it('the right partition: its own counts, last sync, never another partition\'s', async () => {
    await seed({ organizationId: ORG_A, deviceUserId: USER_1 }, { local: 2, conflict: 1, drafts: 1, lastSync: '2026-10-15T08:00:00.000Z' })
    await seed({ organizationId: ORG_B, deviceUserId: USER_1 }, { local: 5, drafts: 3 })
    await seed({ organizationId: ORG_A, deviceUserId: USER_2 }, { local: 7 })
    mount(ORG_A, principal(USER_1).watch)
    await ready()
    expect(latest.local).toMatchObject({ outboxPending: 3, outboxConflicts: 1, outboxFailed: 0, draftsPending: 1, lastSuccessfulSyncAt: '2026-10-15T08:00:00.000Z',
      foreign: { partitions: 2, unsyncedWork: 15 } })
  })
  it('an organization change drops the old partition at once', async () => {
    await seed({ organizationId: ORG_A, deviceUserId: USER_1 }, { local: 2 })
    const { setOrg } = mount(ORG_A, principal(USER_1).watch)
    await ready()
    expect(latest.local?.outboxPending).toBe(2)
    setOrg(ORG_B)
    expect(latest.local).toBeNull()                                                   // same render: nothing of A is left
    await ready()
    expect(latest.local?.outboxPending).toBe(0)
  })
  it('a principal change (re-enrollment) drops the old partition at once', async () => {
    await seed({ organizationId: ORG_A, deviceUserId: USER_1 }, { local: 1, drafts: 2 })
    const p = principal(USER_1)
    mount(ORG_A, p.watch)
    await ready()
    expect(latest.local?.draftsPending).toBe(2)
    p.set(USER_2)
    expect(latest.local).toBeNull()
    await ready()
    expect(latest.local).toMatchObject({ outboxPending: 0, draftsPending: 0, foreign: { partitions: 1, unsyncedWork: 3 } })
  })
  it('an unbound device (no organization) or a signed-out device has no partition and no local data', async () => {
    await seed({ organizationId: ORG_A, deviceUserId: USER_1 }, { local: 1 })
    const p = principal(USER_1)
    const { setOrg } = mount(ORG_A, p.watch)
    await ready()
    setOrg(null)
    expect([latest.partitionActive, latest.storage, latest.local]).toEqual([false, 'none', null])
    setOrg(ORG_A)
    await ready()
    p.set(null)
    expect([latest.partitionActive, latest.local]).toEqual([false, null])
  })
})

describe('storage', () => {
  it('unavailable IndexedDB is explicit and the app keeps rendering', async () => {
    mount(ORG_A, principal(USER_1).watch, { openDb: () => Promise.reject(new OfflineStorageError('UNAVAILABLE', 'no IndexedDB')) })
    await waitFor(() => expect(latest.storage).toBe('unavailable'))
    expect(screen.getByTestId('probe').textContent).toBe('unavailable')
    expect(latest.local).toBeNull()
    expect(localStorage.length).toBe(0)                                               // no fallback store
    expect(await act(() => latest.syncNow())).toEqual({ kind: 'blocked', reason: 'storage_unavailable', pending: 0 })
  })
  it('schema-version metadata is initialized when the partition opens', async () => {
    mount(ORG_A, principal(USER_1).watch)
    await ready()
    const db = await openDb()
    expect(await createOfflineStore(db, { organizationId: ORG_A, deviceUserId: USER_1 }).meta.get('storageSchemaVersion')).toBe(db.version)
    db.close()
  })
})

describe('persistence', () => {
  it('reads persisted() without asking; asks only on request, and records the answer', async () => {
    const persist = vi.fn(async () => true)
    mount(ORG_A, principal(USER_1).watch, { storageApi: { storage: { persisted: async () => false, persist } } })
    await waitFor(() => expect(latest.persistence).toBe('not_granted'))
    expect(persist).not.toHaveBeenCalled()
    expect(await act(() => latest.requestPersistence())).toBe('granted')
    expect(persist).toHaveBeenCalledTimes(1)
    const db = await openDb()
    expect(await createOfflineStore(db, { organizationId: ORG_A, deviceUserId: USER_1 }).meta.get('storagePersistGranted')).toBe(true)
    db.close()
  })
  it('denied or missing API stays non-fatal', async () => {
    mount(ORG_A, principal(USER_1).watch, { storageApi: { storage: { persisted: async () => { throw new Error('x') }, persist: async () => false } } })
    await waitFor(() => expect(latest.persistence).toBe('unavailable'))
    expect(await act(() => latest.requestPersistence())).toBe('denied')
    expect(latest.storage).toBe('ready')
  })
})

describe('foreground coordinator', () => {
  it('a manual request with nothing queued returns cleanly', async () => {
    mount(ORG_A, principal(USER_1).watch)
    await ready()
    expect(await act(() => latest.syncNow())).toEqual({ kind: 'nothing_to_send' })
    expect(latest.sync).toMatchObject({ status: 'idle', lastTrigger: 'manual' })
  })
  it('queued work is not sent in Offline 3: blocked, and the counts stay', async () => {
    await seed({ organizationId: ORG_A, deviceUserId: USER_1 }, { local: 1 })
    mount(ORG_A, principal(USER_1).watch)
    await ready()
    expect(await act(() => latest.syncNow())).toEqual({ kind: 'blocked', reason: 'sending_not_available', pending: 1 })
    expect(latest.sync.status).toBe('blocked')
    expect(latest.local?.outboxPending).toBe(1)
  })
  it('the partition opening and connectivity returning each request a cycle', async () => {
    mount(ORG_A, principal(USER_1).watch)
    await waitFor(() => expect(latest.sync).toMatchObject({ lastTrigger: 'start', status: 'idle' }))
    act(() => { online = false; window.dispatchEvent(new Event('offline')) })
    expect(latest.connectivity).toBe('offline')
    act(() => { online = true; window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(latest.sync).toMatchObject({ lastTrigger: 'reconnect', status: 'idle', lastOutcome: { kind: 'nothing_to_send' } }))
  })
})
