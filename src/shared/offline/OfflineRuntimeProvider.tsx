// Binds the offline runtime to the device's current identity (ADR-0010 §6, §9). The active partition exists only
// once both the organization and the device principal are known; when either changes, the old partition's status,
// coordinator and queries are dropped in the same render. Other partitions are only counted, never shown,
// synchronized or purged here.
// The organization comes from the server (device context) or, offline, from the cached binding. A server answer keeps
// the cached binding current; a server answer that the device is not bound removes it (queued work stays where it
// is). Storage is opened when needed; if IndexedDB is unavailable the runtime says so and the app keeps working online.
// Business behaviour comes from the caller: the drainer (what to send), the snapshot refresh (what to keep for offline
// capture) and onDrained (what to refresh afterwards).
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteBinding, saveBinding, type PublicOrganization } from './binding'
import { getConnectivity, subscribeConnectivity, useConnectivity } from './connectivity'
import { createSyncCoordinator, type Drainer, type SyncCoordinator, type SyncOutcome } from './coordinator'
import { openSharedOfflineDb } from './db'
import { findForeignPartitions } from './partition'
import { readPersistentStorage, requestPersistentStorage, type StorageNavigator } from './persistence'
import { IDLE_SYNC, offlineKeys, OfflineRuntimeContext, type BindingSource, type OfflineRuntime, type StorageState } from './runtime'
import { readLocalStatus } from './status'
import { createOfflineStore, type OfflineStore } from './store'
import type { Partition } from './types'
import { isUuid } from './validate'

/** The device's binding as the server last answered in this session: bound, not bound, or not known (offline). */
export type ServerBinding = 'bound' | 'unbound' | 'unknown'

const RETRY_DELAY_MS = 60_000                // gentle retry after a transient failure, while the app is open and online

/** One database connection, opened on first use and opened again after a failure. */
function dbHandle(open: () => Promise<IDBDatabase>) {
  let current: Promise<IDBDatabase> | null = null
  return { get: () => (current ??= open().catch((e: unknown) => { current = null; throw e })) }
}

const noSubscribe = () => () => {}
const idleSnapshot = () => IDLE_SYNC
// local reads: they must run without a connection too (React Query pauses `online` queries while offline)
const LOCAL = { networkMode: 'always', retry: false, staleTime: Infinity } as const

export function OfflineRuntimeProvider({
  organization, principal, bindingSource, serverBinding = 'unknown', drain, refreshSnapshot, onDrained,
  openDb = openSharedOfflineDb, storageApi, children,
}: {
  organization: PublicOrganization | null
  principal: string | null
  bindingSource: BindingSource | null
  serverBinding?: ServerBinding
  drain?: Drainer
  refreshSnapshot?: (store: OfflineStore) => Promise<void>
  onDrained?: (outcome: SyncOutcome) => void
  openDb?: () => Promise<IDBDatabase>
  storageApi?: StorageNavigator     // navigator by default
  children: ReactNode
}) {
  const queryClient = useQueryClient()
  const connectivity = useConnectivity()
  const organizationId = organization?.id ?? null
  const partitionKey = organizationId && principal && isUuid(organizationId) && isUuid(principal) ? `${organizationId}|${principal}` : null
  const partition = useMemo<Partition | null>(() => {
    if (!partitionKey) return null
    const [o, u] = partitionKey.split('|') as [string, string]
    return { organizationId: o, deviceUserId: u }
  }, [partitionKey])

  const [db] = useState(() => dbHandle(openDb))
  const getDb = db.get

  // ---------- the cached binding follows the server's answer ----------
  const orgJson = organization ? JSON.stringify(organization) : null
  useEffect(() => {
    if (!principal || !isUuid(principal) || serverBinding === 'unknown') return
    const write: ((d: IDBDatabase) => Promise<unknown>) | null = serverBinding === 'bound' && orgJson
      ? (d: IDBDatabase) => saveBinding(d, { deviceUserId: principal, organization: JSON.parse(orgJson) as PublicOrganization, verifiedAt: new Date().toISOString() })
      : serverBinding === 'unbound' ? (d: IDBDatabase) => deleteBinding(d, principal) : null
    if (!write) return
    void getDb().then(write).then(() => queryClient.invalidateQueries({ queryKey: offlineKeys.binding(principal) }), () => { /* storage unavailable */ })
  }, [principal, serverBinding, orgJson, getDb, queryClient])

  // ---------- local status ----------
  const local = useQuery({
    queryKey: partition ? offlineKeys.local(partition) : [...offlineKeys.all, 'local', 'none'],
    queryFn: async () => readLocalStatus(await getDb(), partition!),
    enabled: !!partition, ...LOCAL,
  })
  // no active partition (an unbound device): only how much unsynced work other bindings left here
  const held = useQuery({
    queryKey: offlineKeys.held(principal ?? 'none'),
    queryFn: async () => (await findForeignPartitions(await getDb(), null)).reduce((n, p) => n + p.outboxUnsynced + p.draftsPending, 0),
    enabled: !partition && !!principal, ...LOCAL,
  })
  const persisted = useQuery({ queryKey: offlineKeys.persisted, queryFn: () => readPersistentStorage(storageApi), enabled: !!partition, ...LOCAL })

  // ---------- coordinator ----------
  const coordinator = useMemo<SyncCoordinator | null>(() => partition && createSyncCoordinator({
    getStore: async () => createOfflineStore(await getDb(), partition),
    isOnline: () => getConnectivity() === 'online',
    drain,
  }), [partition, getDb, drain])
  const sync = useSyncExternalStore(coordinator?.subscribe ?? noSubscribe, coordinator?.getSnapshot ?? idleSnapshot)

  const refreshLocal = useCallback(async () => {
    if (partition) await queryClient.invalidateQueries({ queryKey: offlineKeys.local(partition) })
  }, [partition, queryClient])
  const after = useCallback(async (outcome: SyncOutcome) => {
    await refreshLocal()
    onDrained?.(outcome)
    return outcome
  }, [refreshLocal, onDrained])

  // triggers: the partition becoming active (start) and connectivity returning (reconnect)
  useEffect(() => {
    if (!coordinator) return
    coordinator.attach()
    void coordinator.request('start').then(after)
    const off = subscribeConnectivity(() => {
      void refreshLocal()
      if (getConnectivity() === 'online') void coordinator.request('reconnect').then(after)
    })
    return () => { off(); coordinator.detach() }
  }, [coordinator, after, refreshLocal])

  // gentle retry: one more cycle a while after a transient failure, only while open and online; never an interval
  const transient = sync.lastOutcome?.kind === 'drained' && (sync.lastOutcome.result.failed > 0 || sync.lastOutcome.result.stopped === 'network')
  useEffect(() => {
    if (!coordinator || !transient || connectivity !== 'online') return
    const t = setTimeout(() => void coordinator.request('retry').then(after), RETRY_DELAY_MS)
    return () => clearTimeout(t)
  }, [coordinator, transient, connectivity, after, sync.lastOutcome])

  // the public capture snapshot is refreshed whenever the server is reachable for this partition
  useEffect(() => {
    if (!partition || !refreshSnapshot || serverBinding !== 'bound' || connectivity !== 'online') return
    void getDb().then((d) => refreshSnapshot(createOfflineStore(d, partition)))
      .then(() => queryClient.invalidateQueries({ queryKey: offlineKeys.snapshot(partition) }), () => { /* kept: the previous snapshot */ })
  }, [partition, refreshSnapshot, serverBinding, connectivity, getDb, queryClient])

  const storeAccess = useMemo(() => partition && { partition, getStore: async () => createOfflineStore(await getDb(), partition) }, [partition, getDb])

  const storage: StorageState = !partition ? 'none' : local.isError ? 'unavailable' : local.isPending ? 'loading' : 'ready'

  const value = useMemo<Omit<OfflineRuntime, 'connectivity'>>(() => ({
    partitionActive: !!partition,
    bindingSource: partition ? bindingSource : null,
    storage,
    local: partition && local.data ? local.data : null,
    heldElsewhere: !partition ? held.data ?? 0 : 0,
    persistence: partition ? persisted.data ?? null : null,
    sync: coordinator ? sync : IDLE_SYNC,
    storeAccess,
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
    syncNow: async () => (coordinator ? after(await coordinator.request('manual')) : null),
  }), [partition, bindingSource, storage, local.data, held.data, persisted.data, coordinator, sync, storeAccess, refreshLocal, queryClient, storageApi, getDb, after])

  return <OfflineRuntimeContext.Provider value={value}>{children}</OfflineRuntimeContext.Provider>
}
