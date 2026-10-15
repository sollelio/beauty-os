// Binds the offline runtime to the device's current identity (ADR-0010 §6, §9). The active partition exists only
// once both the organization (device context) and the device principal (Supabase auth user) are known; when either
// changes, the old partition's status, coordinator and queries are dropped in the same render. Other partitions are
// only counted (LocalStatus.foreign), never shown, synchronized or purged here.
// Storage is opened when a partition first becomes active; if IndexedDB is unavailable, the runtime says so and the
// app keeps working online — there is no fallback store. No business record is written here.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getConnectivity, subscribeConnectivity } from './connectivity'
import { createSyncCoordinator, type SyncCoordinator } from './coordinator'
import { openOfflineDb } from './db'
import { readPersistentStorage, requestPersistentStorage, type StorageNavigator } from './persistence'
import { IDLE_SYNC, offlineKeys, OfflineRuntimeContext, type OfflineRuntime, type StorageState } from './runtime'
import { readLocalStatus } from './status'
import { createOfflineStore } from './store'
import type { Partition } from './types'
import { isUuid } from './validate'

/** Reports the device principal now and on every change; returns the unsubscribe. */
export type PrincipalWatcher = (onChange: (deviceUserId: string | null) => void) => () => void

/** One database connection, opened on first use, opened again after a failure, closed when the provider goes. */
function dbHandle(open: () => Promise<IDBDatabase>) {
  let current: Promise<IDBDatabase> | null = null
  return {
    get: () => (current ??= open().catch((e: unknown) => { current = null; throw e })),
    close: () => { void current?.then((d) => d.close(), () => {}); current = null },
  }
}

const noSubscribe = () => () => {}
const idleSnapshot = () => IDLE_SYNC
// local reads: they must run without a connection too (React Query pauses `online` queries while offline)
const LOCAL = { networkMode: 'always', retry: false, staleTime: Infinity } as const

export function OfflineRuntimeProvider({ organizationId, watchPrincipal, openDb = openOfflineDb, storageApi, children }: {
  organizationId: string | null
  watchPrincipal: PrincipalWatcher
  openDb?: () => Promise<IDBDatabase>
  storageApi?: StorageNavigator     // navigator by default
  children: ReactNode
}) {
  const queryClient = useQueryClient()
  const [principal, setPrincipal] = useState<string | null>(null)
  useEffect(() => watchPrincipal(setPrincipal), [watchPrincipal])

  const partitionKey = organizationId && principal && isUuid(organizationId) && isUuid(principal) ? `${organizationId}|${principal}` : null
  const partition = useMemo<Partition | null>(() => {
    if (!partitionKey) return null
    const [o, u] = partitionKey.split('|') as [string, string]
    return { organizationId: o, deviceUserId: u }
  }, [partitionKey])

  const [db] = useState(() => dbHandle(openDb))
  useEffect(() => () => db.close(), [db])
  const getDb = db.get

  const local = useQuery({
    queryKey: partition ? offlineKeys.local(partition) : [...offlineKeys.all, 'local', 'none'],
    queryFn: async () => readLocalStatus(await getDb(), partition!),
    enabled: !!partition, ...LOCAL,
  })
  const persisted = useQuery({ queryKey: offlineKeys.persisted, queryFn: () => readPersistentStorage(storageApi), enabled: !!partition, ...LOCAL })

  const coordinator = useMemo<SyncCoordinator | null>(() => partition && createSyncCoordinator({
    getStore: async () => createOfflineStore(await getDb(), partition),
    isOnline: () => getConnectivity() === 'online',
  }), [partition, getDb])
  const sync = useSyncExternalStore(coordinator?.subscribe ?? noSubscribe, coordinator?.getSnapshot ?? idleSnapshot)

  const refreshLocal = useCallback(async () => {
    if (partition) await queryClient.invalidateQueries({ queryKey: offlineKeys.local(partition) })
  }, [partition, queryClient])

  // triggers: the partition becoming active (start) and connectivity returning (reconnect); no interval
  useEffect(() => {
    if (!coordinator) return
    coordinator.attach()
    void coordinator.request('start').then(refreshLocal)
    const off = subscribeConnectivity(() => {
      void refreshLocal()
      if (getConnectivity() === 'online') void coordinator.request('reconnect').then(refreshLocal)
    })
    return () => { off(); coordinator.detach() }
  }, [coordinator, refreshLocal])

  const storage: StorageState = !partition ? 'none' : local.isError ? 'unavailable' : local.isPending ? 'loading' : 'ready'

  const value = useMemo<Omit<OfflineRuntime, 'connectivity'>>(() => ({
    partitionActive: !!partition,
    storage,
    local: partition && local.data ? local.data : null,
    persistence: partition ? persisted.data ?? null : null,
    sync: coordinator ? sync : IDLE_SYNC,
    refresh: async () => {
      if (!partition) return
      await Promise.all([refreshLocal(), queryClient.invalidateQueries({ queryKey: offlineKeys.persisted })])
    },
    requestPersistence: async () => {
      if (!partition) return null
      const result = await requestPersistentStorage(storageApi)
      try {
        await createOfflineStore(await getDb(), partition).meta.recordPersistResult(result)
      } catch { /* storage unavailable: the browser's answer still stands */ }
      await queryClient.invalidateQueries({ queryKey: offlineKeys.persisted })
      return result
    },
    syncNow: async () => {
      if (!coordinator) return null
      const outcome = await coordinator.request('manual')
      await refreshLocal()
      return outcome
    },
  }), [partition, storage, local.data, persisted.data, coordinator, sync, refreshLocal, queryClient, storageApi, getDb])

  return <OfflineRuntimeContext.Provider value={value}>{children}</OfflineRuntimeContext.Provider>
}
