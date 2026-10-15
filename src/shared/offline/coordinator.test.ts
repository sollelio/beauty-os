// Offline 3 · the foreground coordinator's structure: no drainer exists yet, so nothing is ever reported as sent.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSyncCoordinator, type Drainer } from './coordinator'
import { openOfflineDb } from './db'
import { createOfflineStore, type OfflineStore } from './store'

const A1 = { organizationId: '00000000-0000-4000-8000-0000000000a1', deviceUserId: '11111111-1111-4111-8111-111111111111' }
const queue = (s: OfflineStore) => s.outbox.put({ commandId: crypto.randomUUID(), type: 'record_service', occurredAt: '2026-10-15T09:00:00.000Z', payload: { p_value_minor: 100 } })

let store: OfflineStore
beforeEach(async () => { store = createOfflineStore(await openOfflineDb({ factory: new IDBFactory() }), A1) })
const make = (over: { online?: boolean; drain?: Drainer; getStore?: () => Promise<OfflineStore> } = {}) =>
  createSyncCoordinator({ getStore: over.getStore ?? (async () => store), isOnline: () => over.online ?? true, drain: over.drain })

describe('sync coordinator', () => {
  it('nothing queued: a cycle ends idle with "nothing to send"', async () => {
    const c = make()
    const seen: string[] = []
    c.subscribe(() => seen.push(c.getSnapshot().status))
    expect(await c.request('manual')).toEqual({ kind: 'nothing_to_send' })
    expect(seen).toEqual(['checking', 'idle'])
    expect(c.getSnapshot()).toEqual({ status: 'idle', lastTrigger: 'manual', lastOutcome: { kind: 'nothing_to_send' } })
  })
  it('with queued work and no drainer it is blocked, never "sent"; the work is untouched', async () => {
    const item = await queue(store)
    expect(await make().request('start')).toEqual({ kind: 'blocked', reason: 'sending_not_available', pending: 1 })
    expect(await make({ online: false }).request('reconnect')).toEqual({ kind: 'blocked', reason: 'offline', pending: 1 })
    expect((await store.outbox.get(item.commandId))?.state).toBe('local')
  })
  it('storage unavailable is a blocked cycle, not a crash', async () => {
    const c = make({ getStore: () => Promise.reject(new Error('no IndexedDB')) })
    expect(await c.request('start')).toEqual({ kind: 'blocked', reason: 'storage_unavailable', pending: 0 })
    expect(c.getSnapshot().status).toBe('blocked')
  })
  it('one cycle at a time: a request during a cycle gets one follow-up cycle, later requests join it', async () => {
    const getStore = vi.fn(async () => store)
    const c = make({ getStore })
    const triggers: (string | null)[] = []
    c.subscribe(() => { if (c.getSnapshot().status === 'checking') triggers.push(c.getSnapshot().lastTrigger) })
    const [first, second, third] = [c.request('start'), c.request('reconnect'), c.request('manual')]
    expect(second).toBe(third)
    await Promise.all([first, second])
    expect(getStore).toHaveBeenCalledTimes(2)
    expect(triggers).toEqual(['start', 'reconnect'])
  })
  it('the future drainer receives the store and an abort signal (shape only; none is wired in Offline 3)', async () => {
    await queue(store)
    const drain = vi.fn<Drainer>(async () => ({ synced: 0, failed: 0, conflicts: 0 }))
    expect(await make({ drain }).request('manual')).toEqual({ kind: 'drained', result: { synced: 0, failed: 0, conflicts: 0 } })
    expect(drain.mock.calls[0]![0]).toBe(store)
    expect(drain.mock.calls[0]![1]).toBeInstanceOf(AbortSignal)
  })
  it('detached: refuses requests, publishes no result, and can be attached again', async () => {
    const c = make()
    const listener = vi.fn()
    c.subscribe(listener)
    const running = c.request('start')
    c.detach()
    await running
    expect(listener).toHaveBeenCalledTimes(1)                                     // 'checking' only, no result
    expect(await c.request('manual')).toEqual({ kind: 'blocked', reason: 'detached', pending: 0 })
    c.attach()
    expect(await c.request('manual')).toEqual({ kind: 'nothing_to_send' })
  })
})
