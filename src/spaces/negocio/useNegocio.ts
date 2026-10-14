// Negócio page hooks (UX slice 8): the selected period and the server-ended context, shared by every page.
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { clearPrivateData } from '../../modules/org/privateContext'
import { toAppError } from '../../shared/errors'

/** The server ended the private context (expiry, revocation, another holder): drop everything sensitive. */
export function useLostContext(errors: unknown[]) {
  const qc = useQueryClient()
  const lost = errors.some((e) => e && toAppError(e).code === 'VERIFICATION_REQUIRED')
  useEffect(() => { if (lost) clearPrivateData(qc) }, [lost, qc])
  return lost
}

/** The selected period (?p=) and the Visão geral path that keeps it — the parent of every Negócio page. */
export function useNegocioPeriod() {
  const [sp] = useSearchParams()
  const p = sp.get('p')
  return { p, overview: p ? `/privado/negocio?p=${p}` : '/privado/negocio' }
}
