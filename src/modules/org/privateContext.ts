// Private context (ADR-0009 `private_session` scope; Architecture Definition §8, E-4): a verified person on this
// device session may read sensitive figures for a short time. The database is the boundary — every sensitive
// query re-checks the grant. The client only mirrors it: all sensitive queries live under PRIVATE_ROOT and are
// removed (not hidden) on exit, expiry, revocation, or when the private area is left.
import { useEffect } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export const PRIVATE_ROOT = ['private'] as const
export const privateKeys = { status: ['org', 'private-status'] as const,   // outside PRIVATE_ROOT: it holds no figures and must survive removal
  people: ['org', 'private-people'] as const }

export type PrivateStatus =
  | { active: false }
  | { active: true; person_id: string; display_name: string; view: 'manager' | 'self'; expires_at: string }

export async function getPrivateStatus(): Promise<PrivateStatus> {
  const { data, error } = await getSupabase().rpc('private_context_status')
  if (error) throw toAppError(error)
  return data as PrivateStatus
}

/** People who can open a private context on this device (names only). */
export async function listPrivatePeople(): Promise<{ id: string; display_name: string }[]> {
  const { data, error } = await getSupabase().rpc('list_private_people')
  if (error) throw toAppError(error)
  return data
}

/** Server-side verification with the private-session scope. Failures come back as INVALID / LOCKED. */
export async function enterPrivateContext(personId: string, secret: string): Promise<void> {
  const { data, error } = await getSupabase().rpc('verify_person', { p_person_id: personId, p_secret: secret, p_scope: 'private_session' })
  if (error) throw toAppError(error)
  const r = data as { ok: boolean; error?: string }
  if (!r.ok) throw toAppError({ message: r.error ?? 'NOT_AUTHORIZED' })
}

/** Drop every sensitive query from the cache and mark the context closed locally. */
export function clearPrivateData(qc: QueryClient) {
  qc.removeQueries({ queryKey: PRIVATE_ROOT })
  qc.setQueryData<PrivateStatus>(privateKeys.status, { active: false })
}

export async function exitPrivateContext(qc: QueryClient) {
  clearPrivateData(qc)
  try { await getSupabase().rpc('end_private_context') } catch { /* the grant still expires server-side */ }
}

/** Current private context; ends locally at its server-stated expiry. */
export function usePrivateStatus() {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: privateKeys.status, queryFn: getPrivateStatus, refetchOnWindowFocus: true, staleTime: 0 })
  const expiresAt = status.data?.active ? status.data.expires_at : null
  useEffect(() => {
    if (!expiresAt) return
    const t = setTimeout(() => clearPrivateData(qc), Math.max(0, new Date(expiresAt).getTime() - Date.now()))
    return () => clearTimeout(t)
  }, [expiresAt, qc])
  return status
}
