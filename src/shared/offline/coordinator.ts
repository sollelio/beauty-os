// Foreground synchronization coordinator (ADR-0010 §9): one cycle at a time, started by the app opening a partition,
// by connectivity returning, by a gentle retry, or by a person ("Enviar agora"). Without a drainer nothing is sent:
// a cycle reports "nothing to send", or that it is blocked, never success.
// No interval runs here: the runtime asks for a gentle retry after a transient failure (Offline 4).
import type { OfflineStore } from './store'

/** The coordinator's own status, separate from each outbox item's local/syncing/synced/failed/conflict state. */
export type SyncStatus = 'idle' | 'checking' | 'syncing' | 'blocked' | 'error'
export type SyncTrigger = 'start' | 'reconnect' | 'manual' | 'retry'

/** What a drainer reports after sending queued commands, oldest first (Offline 4). `stopped`: why it stopped before
 *  the end — the network went away, or the server no longer recognises this device / principal for the partition. */
export type DrainResult = { synced: number; failed: number; conflicts: number; stopped?: 'network' | 'unbound' | 'principal_changed' }
export type Drainer = (store: OfflineStore, signal: AbortSignal) => Promise<DrainResult>

export type SyncOutcome =
  | { kind: 'nothing_to_send' }
  | { kind: 'blocked'; reason: 'offline' | 'storage_unavailable' | 'sending_not_available' | 'detached'; pending: number }
  | { kind: 'drained'; result: DrainResult }
  | { kind: 'error'; message: string }

export type SyncSnapshot = { status: SyncStatus; lastTrigger: SyncTrigger | null; lastOutcome: SyncOutcome | null }

export type SyncCoordinator = {
  request: (trigger: SyncTrigger) => Promise<SyncOutcome>
  getSnapshot: () => SyncSnapshot
  subscribe: (listener: () => void) => () => void
  /** Detached (its partition is no longer active): requests are refused, a running cycle stops before its next step
   *  and its result is not published. Reversible, so a component may attach and detach it from an effect. */
  detach: () => void
  attach: () => void
}

const IDLE: SyncSnapshot = { status: 'idle', lastTrigger: null, lastOutcome: null }

export function createSyncCoordinator({ getStore, isOnline, drain }: {
  getStore: () => Promise<OfflineStore>
  isOnline: () => boolean
  drain?: Drainer
}): SyncCoordinator {
  let snapshot = IDLE
  let running: Promise<SyncOutcome> | null = null
  let followUp: Promise<SyncOutcome> | null = null
  const listeners = new Set<() => void>()
  let attached = new AbortController()
  const DETACHED: SyncOutcome = { kind: 'blocked', reason: 'detached', pending: 0 }

  async function cycle(trigger: SyncTrigger, signal: AbortSignal): Promise<SyncOutcome> {
    const set = (next: Partial<SyncSnapshot>) => {
      if (signal.aborted) return
      snapshot = { ...snapshot, ...next }
      listeners.forEach((l) => l())
    }
    const finish = (status: SyncStatus, outcome: SyncOutcome) => { set({ status, lastOutcome: outcome }); return outcome }
    set({ status: 'checking', lastTrigger: trigger })
    let store: OfflineStore
    try {
      store = await getStore()
    } catch {
      return finish('blocked', { kind: 'blocked', reason: 'storage_unavailable', pending: 0 })
    }
    try {
      const pending = await store.outbox.countPending()
      if (signal.aborted) return DETACHED
      if (pending === 0) return finish('idle', { kind: 'nothing_to_send' })
      if (!isOnline()) return finish('blocked', { kind: 'blocked', reason: 'offline', pending })
      if (!drain) return finish('blocked', { kind: 'blocked', reason: 'sending_not_available', pending })
      set({ status: 'syncing' })
      return finish('idle', { kind: 'drained', result: await drain(store, signal) })
    } catch (e) {
      return finish('error', { kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  function start(trigger: SyncTrigger): Promise<SyncOutcome> {
    const current: Promise<SyncOutcome> = cycle(trigger, attached.signal).finally(() => { if (running === current) running = null })
    running = current
    return current
  }

  return {
    /**
     * Starts a cycle. One runs at a time: a request made while one runs (connectivity returned during the start
     * cycle, a tap on "Enviar agora") gets one more cycle right after it, and further requests join that one.
     */
    request: (trigger) => {
      if (attached.signal.aborted) return Promise.resolve(DETACHED)
      if (!running) return start(trigger)
      followUp ??= running.then(() => {
        followUp = null
        return attached.signal.aborted ? DETACHED : start(trigger)
      })
      return followUp
    },
    getSnapshot: () => snapshot,
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    detach: () => { attached.abort(); running = null; followUp = null },
    attach: () => { if (attached.signal.aborted) attached = new AbortController() },
  }
}
