import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useOutletContext } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { exitPrivateContext, usePrivateStatus, type PrivateStatus } from '../modules/org/privateContext'

// Leaving the private area ends the context so it never passes to the next holder (07 §8). Deferred so a
// StrictMode remount, or moving between private screens, does not end it.
let pendingExit: ReturnType<typeof setTimeout> | undefined

export function PrivateGate() {
  const qc = useQueryClient()
  const status = usePrivateStatus()
  const location = useLocation()
  const next = location.pathname + location.search
  useEffect(() => {
    clearTimeout(pendingExit)
    return () => { pendingExit = setTimeout(() => void exitPrivateContext(qc), 0) }
  }, [qc])

  // never decide on a status that is being refreshed (a stale "inactive" would end a context that was just opened)
  if (status.isPending || (status.isFetching && !status.data?.active)) return <main className="app-main"><p className="muted">A carregar…</p></main>
  if (status.isError) return <Navigate to="/privado/entrar" replace state={{ next }} />
  if (!status.data.active) return <Navigate to="/privado/entrar" replace state={{ ended: true, next }} />
  return <Outlet context={status.data} />
}

const usePrivateContext = () => useOutletContext<Extract<PrivateStatus, { active: true }>>()

export function PrivateHome() {
  const ctx = usePrivateContext()
  return <Navigate to={ctx.view === 'manager' ? '/privado/equipa' : `/privado/situacao/${ctx.person_id}`} replace />
}
