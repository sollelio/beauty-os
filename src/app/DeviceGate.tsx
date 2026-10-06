import { useQuery } from '@tanstack/react-query'
import { Outlet } from 'react-router'
import { getDeviceContext, orgKeys } from '../modules/org/api'
import { OrganizationContext } from '../modules/org/OrganizationContext'
import { EnrollmentScreen } from '../spaces/dispositivo/EnrollmentScreen'

// Unbound devices see nothing but enrollment; the database enforces the same rule (ADR-0009).
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
  if (!ctx.data.bound) return <EnrollmentScreen />
  return (
    <OrganizationContext.Provider value={ctx.data.organization}>
      <Outlet />
    </OrganizationContext.Provider>
  )
}
