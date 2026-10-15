// The offline runtime as screens see it (ADR-0010 §9, §11): connectivity, whether a partition is active, local counts
// and dates, persistence and the coordinator's status, plus three actions. Never the stores or record content.
// Outside OfflineRuntimeProvider (an unbound device, or a screen rendered alone) it is inactive: no partition, no
// local data.
import { createContext, useContext, useMemo } from 'react'
import { useConnectivity, type Connectivity } from './connectivity'
import type { SyncOutcome, SyncSnapshot } from './coordinator'
import type { PersistResult, PersistStatus } from './persistence'
import type { LocalStatus } from './status'
import type { Partition } from './types'

export type StorageState = 'none' | 'loading' | 'ready' | 'unavailable'

export type OfflineRuntime = {
  connectivity: Connectivity
  partitionActive: boolean
  storage: StorageState             // `unavailable`: no IndexedDB or it failed to open; the app keeps working online
  local: LocalStatus | null
  persistence: PersistStatus | null
  sync: SyncSnapshot
  refresh: () => Promise<void>
  /** Asks the browser to keep this device's storage (ADR-0010 §8); only when a person's action calls it. */
  requestPersistence: () => Promise<PersistResult | null>
  /** Runs a foreground cycle now ("Enviar agora"). Nothing is sent before Offline 4. */
  syncNow: () => Promise<SyncOutcome | null>
}

export const IDLE_SYNC: SyncSnapshot = { status: 'idle', lastTrigger: null, lastOutcome: null }
export const INACTIVE_RUNTIME: Omit<OfflineRuntime, 'connectivity'> = {
  partitionActive: false, storage: 'none', local: null, persistence: null, sync: IDLE_SYNC,
  refresh: async () => {}, requestPersistence: async () => null, syncNow: async () => null,
}

export const OfflineRuntimeContext = createContext<Omit<OfflineRuntime, 'connectivity'> | null>(null)

export const offlineKeys = {
  all: ['offline'] as const,
  local: (p: Partition) => ['offline', 'local', p.organizationId, p.deviceUserId] as const,
  persisted: ['offline', 'persisted'] as const,
}

export function useOfflineRuntime(): OfflineRuntime {
  const ctx = useContext(OfflineRuntimeContext)
  const connectivity = useConnectivity()
  return useMemo(() => ({ ...(ctx ?? INACTIVE_RUNTIME), connectivity }), [ctx, connectivity])
}
