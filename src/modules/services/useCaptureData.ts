// The lists Registar serviço needs. Online: the server, as before — and each successful load is kept as the capture
// snapshot. Offline (no connection, or running on the cached binding): the snapshot only, and only while it is at most
// 48 hours old (ADR-0010 §2); otherwise capture is blocked with a reason, never filled from older data.
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { catalogueKeys, listServices } from '../catalogue/api'
import { isOfflineMode, offlineKeys, useOfflineRuntime } from '../../shared/offline/runtime'
import { listCapturePeople, listPaymentMethods, servicesKeys } from './api'
import { captureSnapshotState, readCaptureSnapshot, writeCaptureSnapshot, type CaptureData } from './offline'

export type CaptureBlock = 'missing' | 'stale' | 'unavailable'
export type CaptureDataView = CaptureData & {
  offline: boolean
  loading: boolean
  /** offline only: why a new service cannot be captured on this device now */
  blocked: CaptureBlock | null
  errors: { people: boolean; services: boolean; paymentMethods: boolean }
}

export function useCaptureData(): CaptureDataView {
  const runtime = useOfflineRuntime()
  const offline = isOfflineMode(runtime)
  const access = runtime.storeAccess
  const people = useQuery({ queryKey: servicesKeys.people, queryFn: listCapturePeople, enabled: !offline })
  const methods = useQuery({ queryKey: servicesKeys.paymentMethods, queryFn: listPaymentMethods, enabled: !offline })
  const catalogue = useQuery({ queryKey: catalogueKeys.services, queryFn: listServices, enabled: !offline })
  const snapshot = useQuery({
    queryKey: access ? offlineKeys.snapshot(access.partition) : [...offlineKeys.all, 'snapshot', 'none'],
    queryFn: async () => readCaptureSnapshot(await access!.getStore()),
    enabled: offline && !!access, networkMode: 'always', retry: false, staleTime: 0,
  })

  // after a successful online load, keep exactly these lists for offline capture
  useEffect(() => {
    if (offline || !access || !people.data || !methods.data || !catalogue.data) return
    const data = { people: people.data, services: catalogue.data, paymentMethods: methods.data }
    void access.getStore().then((s) => writeCaptureSnapshot(s, data)).catch(() => { /* the previous snapshot stays */ })
  }, [offline, access, people.data, methods.data, catalogue.data])

  if (!offline) {
    return {
      offline, people: people.data ?? [], services: catalogue.data ?? [], paymentMethods: methods.data ?? [],
      loading: people.isPending || methods.isPending || catalogue.isPending, blocked: null,
      errors: { people: people.isError, services: catalogue.isError, paymentMethods: methods.isError },
    }
  }
  const none = { people: [], services: [], paymentMethods: [], errors: { people: false, services: false, paymentMethods: false } }
  if (!access || runtime.storage === 'unavailable' || snapshot.isError) return { ...none, offline, loading: false, blocked: 'unavailable' }
  if (snapshot.isPending) return { ...none, offline, loading: true, blocked: null }
  const state = captureSnapshotState(snapshot.data)
  if (state !== 'ok') return { ...none, offline, loading: false, blocked: state }
  const snap = snapshot.data!
  return { ...none, offline, loading: false, blocked: null, people: snap.people, services: snap.services, paymentMethods: snap.paymentMethods }
}
