import { useQuery } from '@tanstack/react-query'
import { Outlet } from 'react-router'
import { getDeviceContext, orgKeys, watchDevicePrincipal } from '../modules/org/api'
import { OrganizationContext } from '../modules/org/OrganizationContext'
import { OfflineRuntimeProvider } from '../shared/offline/OfflineRuntimeProvider'
import { EnrollmentScreen } from '../spaces/dispositivo/EnrollmentScreen'

// Unbound devices see nothing but enrollment; the database enforces the same rule (ADR-0009).
// The offline runtime (ADR-0010) is active only for a bound device: unbound, it has no partition and no local data.
export function DeviceGate() {
  const ctx = useQuery({ queryKey: orgKeys.deviceContext, queryFn: getDeviceContext })
  if (ctx.isPending) return <main className="app-main"><p className="muted">A carregar…</p></main>
  if (ctx.isError) {
    return (
      <main className="app-main">
        <div className="notice notice-error" role="alert">Não foi possível ligar ao servidor.</div>
        <button className="btn btn-secondary" onClick={() => ctx.refetch()}>Tentar novamente</button>
      </main>
    )
  }
  return (
    <OfflineRuntimeProvider organizationId={ctx.data.bound ? ctx.data.organization.id : null} watchPrincipal={watchDevicePrincipal}>
      {ctx.data.bound ? (
        <OrganizationContext.Provider value={ctx.data.organization}>
          <Outlet />
        </OrganizationContext.Provider>
      ) : <EnrollmentScreen />}
    </OfflineRuntimeProvider>
  )
}
