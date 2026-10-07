// Fecho helpers (non-component): messages, the period query hook and date labels.
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { VERIFY_MESSAGES } from '../../modules/org/verifyMessages'
import { clearPrivateData } from '../../modules/org/privateContext'
import { fechoKeys, getFecho, STATE_LABEL, type Fecho } from '../../modules/period/api'
import { toAppError } from '../../shared/errors'
import { formatDayShort, formatTime } from '../../shared/time'

export const FECHO_MESSAGES: Record<string, string> = {
  ...VERIFY_MESSAGES,
  STALE_REVIEW: 'Os valores mudaram desde que os reviu (entrou outro registo). Reveja-os e confirme de novo.',
  RULE_PENDING: 'Ainda há regras por definir.',
  PAYMENT_EXCEEDS_APPROVED: 'O valor passa o que está aprovado para esta pessoa.',
  UNPAID_APPROVED_AMOUNTS: 'Ainda há pagamentos aprovados por confirmar.',
  PERIOD_CLOSED: 'O período está fechado. Os valores são só de leitura.',
  PERIOD_STATE_INVALID: 'O período mudou de estado entretanto. Reveja e tente de novo.',
  RESERVE_INSUFFICIENT: 'A reserva não tem saldo suficiente para este valor.',
  RESERVE_EXCEEDS_RECORD: 'O valor passa o que falta pagar deste registo.',
  VALIDATION_FAILED: 'Verifique os valores introduzidos.',
}

/** The Fecho review of the period in ?p= (or the current one). Drops all private data if the context ended. */
export function useFecho() {
  const [sp] = useSearchParams()
  const p = sp.get('p')
  const qc = useQueryClient()
  const q = useQuery({ queryKey: fechoKeys.period(p), queryFn: () => getFecho(p) })
  const lost = q.error && toAppError(q.error).code === 'VERIFICATION_REQUIRED'
  useEffect(() => { if (lost) clearPrivateData(qc) }, [lost, qc])
  const to = (path: string, extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ ...(p ? { p } : {}), ...extra }).toString()
    return qs ? `${path}?${qs}` : path
  }
  return { p, q, to }
}

export function rangeLabel(starts: string, ends: string, tz: string) {
  const a = formatDayShort(starts, tz), b = formatDayShort(ends, tz)
  return a.split(' ')[1] === b.split(' ')[1] ? `${a.split(' ')[0]} – ${b}` : `${a} – ${b}`
}
export const stateLine = (f: Fecho) => `${f.period.label} · ${STATE_LABEL[f.period.state].toLocaleLowerCase('pt-PT')}`
export const when = (iso: string, tz: string) => `${formatDayShort(iso, tz)} ${formatTime(iso, tz)}`

