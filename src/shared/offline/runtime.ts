// The offline runtime as screens see it (ADR-0010 §9, §11): connectivity, whether a partition is active and how the
// binding was established, local counts and dates, persistence and the coordinator's status, plus three actions.
// Never the stores or record content. Outside OfflineRuntimeProvider (an unbound device, or a screen rendered alone)
// it is inactive: no partition, no local data.
import { createContext, useContext, useMemo } from 'react'
import { useConnectivity, type Connectivity } from './connectivity'
import type { SyncOutcome, SyncSnapshot } from './coordinator'
import type { PersistResult, PersistStatus } from './persistence'
import type { LocalStatus } from './status'
import type { OfflineStore } from './store'
import type { Partition } from './types'

export type StorageState = 'none' | 'loading' | 'ready' | 'unavailable'
/** server: the device context answered in this session · cache: the last-known binding, the server not reachable */
export type BindingSource = 'server' | 'cache'

/** For module adapters (capture data, outbox), never for screens: the active partition's store. */
export type OfflineStoreAccess = { partition: Partition; getStore: () => Promise<OfflineStore> }

export type OfflineRuntime = {
  connectivity: Connectivity
  partitionActive: boolean
  bindingSource: BindingSource | null
  storage: StorageState             // `unavailable`: no IndexedDB or it failed to open; the app keeps working online
  local: LocalStatus | null
  /** Unsynced work of other bindings on this device (counts only), e.g. after the device was unbound. */
  heldElsewhere: number
  persistence: PersistStatus | null
  sync: SyncSnapshot
  storeAccess: OfflineStoreAccess | null
  refresh: () => Promise<void>
  /** Asks the browser to keep this device's storage (ADR-0010 §8); only when a person's action calls it. */
  requestPersistence: () => Promise<PersistResult | null>
  /** Runs a foreground cycle now ("Enviar agora"). */
  syncNow: () => Promise<SyncOutcome | null>
  /** The last sync report this device sent (Offline 7): when the server received it, or that it could not be sent. */
  syncReport: { at: string | null; failed: boolean }
  /** Sends this device's sync report now (e.g. before Fecho reads the period's sync state); false when it could not. */
  reportSyncNow: () => Promise<boolean>
  /** Explicit, confirmed by a person: deletes the local work of every other binding on this device. Never migrated. */
  discardForeign: () => Promise<void>
}

export const IDLE_SYNC: SyncSnapshot = { status: 'idle', lastTrigger: null, lastOutcome: null }
export const INACTIVE_RUNTIME: Omit<OfflineRuntime, 'connectivity'> = {
  partitionActive: false, bindingSource: null, storage: 'none', local: null, heldElsewhere: 0, persistence: null, sync: IDLE_SYNC,
  storeAccess: null, refresh: async () => {}, requestPersistence: async () => null, syncNow: async () => null,
  syncReport: { at: null, failed: false }, reportSyncNow: async () => false, discardForeign: async () => {},
}

export const OfflineRuntimeContext = createContext<Omit<OfflineRuntime, 'connectivity'> | null>(null)

export const offlineKeys = {
  all: ['offline'] as const,
  local: (p: Partition) => ['offline', 'local', p.organizationId, p.deviceUserId] as const,
  snapshot: (p: Partition) => ['offline', 'snapshot', p.organizationId, p.deviceUserId] as const,
  held: (deviceUserId: string) => ['offline', 'held', deviceUserId] as const,
  binding: (deviceUserId: string) => ['offline', 'binding', deviceUserId] as const,
  persisted: ['offline', 'persisted'] as const,
}

export function useOfflineRuntime(): OfflineRuntime {
  const ctx = useContext(OfflineRuntimeContext)
  const connectivity = useConnectivity()
  return useMemo(() => ({ ...(ctx ?? INACTIVE_RUNTIME), connectivity }), [ctx, connectivity])
}

/** Offline means: the browser reports no connection, or the app runs on the cached binding (server not reached). */
export const isOfflineMode = (r: Pick<OfflineRuntime, 'connectivity' | 'bindingSource'>) => r.connectivity === 'offline' || r.bindingSource === 'cache'
