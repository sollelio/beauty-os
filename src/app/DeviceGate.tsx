import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Outlet } from 'react-router'
import { getDeviceContext, orgKeys, readStoredPrincipal, watchDevicePrincipal } from '../modules/org/api'
import { OrganizationContext } from '../modules/org/OrganizationContext'
import { refreshCaptureSnapshot, serviceDrainer } from '../modules/services/offline'
import { servicesKeys } from '../modules/services/api'
import { toAppError } from '../shared/errors'
import { getConnectivity } from '../shared/offline/connectivity'
import type { SyncOutcome } from '../shared/offline/coordinator'
import { useCachedBinding, useDevicePrincipal } from '../shared/offline/identity'
import { OfflineRuntimeProvider } from '../shared/offline/OfflineRuntimeProvider'
import { EnrollmentScreen } from '../spaces/dispositivo/EnrollmentScreen'

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
  const onDrained = useCallback((outcome: SyncOutcome) => {
    if (outcome.kind !== 'drained') return
    if (outcome.result.synced > 0) void queryClient.invalidateQueries({ queryKey: servicesKeys.all })
    if (outcome.result.stopped === 'unbound' || outcome.result.stopped === 'principal_changed') void queryClient.invalidateQueries({ queryKey: orgKeys.deviceContext })
  }, [queryClient])

  if (noServer && cached.isPending) return <main className="app-main"><p className="muted">A carregar…</p></main>
  if (noServer && !cached.data) {
    return (
      <main className="app-main">
        <div className="notice notice-neutral" role="status">Sem ligação. Este telemóvel precisa de ligação para abrir o Beauty OS pela primeira vez.</div>
        <button className="btn btn-secondary" onClick={() => ctx.refetch()}>Tentar novamente</button>
      </main>
    )
  }
  if (!noServer && ctx.isPending) return <main className="app-main"><p className="muted">A carregar…</p></main>
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
      drain={serviceDrainer} refreshSnapshot={refreshCaptureSnapshot} onDrained={onDrained}>
      {organization ? (
        <OrganizationContext.Provider value={organization}>
          <Outlet />
        </OrganizationContext.Provider>
      ) : <EnrollmentScreen />}
    </OfflineRuntimeProvider>
  )
}
