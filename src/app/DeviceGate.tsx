import { useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Outlet } from 'react-router'
import { getDeviceContext, orgKeys, readStoredPrincipal, reportDeviceSync, watchDevicePrincipal } from '../modules/org/api'
import { OrganizationContext } from '../modules/org/OrganizationContext'
import { TenantLogoProvider } from '../modules/org/TenantLogo'
import { refreshCaptureSnapshot, serviceDrainer } from '../modules/services/offline'
import { refreshMovementSnapshot } from '../modules/movements/snapshot'
import { servicesKeys } from '../modules/services/api'
import { toAppError } from '../shared/errors'
import { getConnectivity, useConnectivity } from '../shared/offline/connectivity'
import type { SyncOutcome } from '../shared/offline/coordinator'
import { useCachedBinding, useDevicePrincipal } from '../shared/offline/identity'
import { OfflineRuntimeProvider } from '../shared/offline/OfflineRuntimeProvider'
import type { OfflineStore } from '../shared/offline/store'
import { EnrollmentScreen } from '../spaces/dispositivo/EnrollmentScreen'
import { BootPending } from './BootBrandGate'

// The public lists kept for offline capture: Registar serviço's, and the movement drafts' (each refreshed on its own)
const refreshSnapshots = async (store: OfflineStore) => {
  const results = await Promise.allSettled([refreshCaptureSnapshot(store), refreshMovementSnapshot(store)])
  if (results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason
}

// Unbound devices see nothing but enrollment; the database enforces the same rule (ADR-0009).
// Without a connection (ADR-0010, Offline 4), a device previously bound opens on its last-known binding — public
// offline capture only; the server stays authoritative and is asked again as soon as it can be reached. The offline
// runtime is active only for a bound device: unbound, it has no partition and no local data.
export function DeviceGate() {
  const queryClient = useQueryClient()
  const principal = useDevicePrincipal(watchDevicePrincipal, readStoredPrincipal)
  // offline, fail fast to the cached binding instead of retrying a request that cannot succeed
  const ctx = useQuery({ queryKey: orgKeys.deviceContext, queryFn: getDeviceContext, retry: (n) => getConnectivity() === 'online' && n < 1 })
  const noServer = !ctx.data && ((ctx.isPending && ctx.fetchStatus === 'paused') || (ctx.isError && toAppError(ctx.error).kind === 'network'))
  const cached = useCachedBinding(principal, noServer)
  // Opened without a connection, the query library still believes it is online, so the browser's "online" event does
  // not refetch: ask the server again ourselves when the connection returns (until then the runtime stays on the cached
  // binding — no snapshot refresh, no sync report). Only on the return itself (offline → online): "online" with the
  // server unreachable must not ask again after every failure (a «A carregar…» loop).
  const connectivity = useConnectivity()
  const lastConnectivity = useRef(connectivity)
  const probing = useRef(false)
  const { refetch } = ctx
  useEffect(() => {
    const returned = lastConnectivity.current === 'offline' && connectivity === 'online'
    lastConnectivity.current = connectivity
    if (returned && noServer && !probing.current) void refetch()
  }, [noServer, connectivity, refetch])
  // The server can come back with no connectivity change (it was down, a captive portal, DNS): when the app returns to
  // the foreground on the cached binding, ask once in the background. The cached binding stays on screen meanwhile (a
  // refetch would replace the app with «A carregar…»); a failure changes nothing, an answer replaces it. One at a time.
  useEffect(() => {
    if (!noServer) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || getConnectivity() !== 'online' || probing.current
          || queryClient.isFetching({ queryKey: orgKeys.deviceContext }) > 0) return
      probing.current = true
      getDeviceContext()
        .then((answer) => { queryClient.setQueryData(orgKeys.deviceContext, answer) }, () => { /* still unreachable: stay on the cached binding */ })
        .finally(() => { probing.current = false })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [noServer, queryClient])
  const onDrained = useCallback((outcome: SyncOutcome) => {
    if (outcome.kind !== 'drained') return
    if (outcome.result.synced > 0) void queryClient.invalidateQueries({ queryKey: servicesKeys.all })
    if (outcome.result.stopped === 'unbound' || outcome.result.stopped === 'principal_changed') void queryClient.invalidateQueries({ queryKey: orgKeys.deviceContext })
  }, [queryClient])

  // the two loading states hold the Brand Splash (index.html) until an outcome below is reached
  if (noServer && cached.isPending) return <main className="app-main"><p className="muted">A carregar…</p><BootPending /></main>
  if (noServer && !cached.data) {
    return (
      <main className="app-main">
        <div className="notice notice-neutral" role="status">Sem ligação. Este telemóvel precisa de ligação para abrir o Beauty OS pela primeira vez.</div>
        <button className="btn btn-secondary" onClick={() => ctx.refetch()}>Tentar novamente</button>
      </main>
    )
  }
  if (!noServer && ctx.isPending) return <main className="app-main"><p className="muted">A carregar…</p><BootPending /></main>
  if (!noServer && ctx.isError) {
    return (
      <main className="app-main">
        <div className="notice notice-error" role="alert">Não foi possível ligar ao servidor.</div>
        <button className="btn btn-secondary" onClick={() => ctx.refetch()}>Tentar novamente</button>
      </main>
    )
  }

  const organization = ctx.data ? (ctx.data.bound ? ctx.data.organization : null) : cached.data!.organization
  return (
    <OfflineRuntimeProvider organization={organization} principal={principal} bindingSource={ctx.data ? 'server' : 'cache'}
      serverBinding={ctx.data ? (ctx.data.bound ? 'bound' : 'unbound') : 'unknown'}
      drain={serviceDrainer} refreshSnapshot={refreshSnapshots} onDrained={onDrained} reportSync={reportDeviceSync}>
      {/* the organization's logo (T2): kept for this binding only; an unbound device keeps none */}
      <TenantLogoProvider principal={principal} organization={organization}>
        {organization ? (
          <OrganizationContext.Provider value={organization}>
            <Outlet />
          </OrganizationContext.Provider>
        ) : <EnrollmentScreen />}
      </TenantLogoProvider>
    </OfflineRuntimeProvider>
  )
}
