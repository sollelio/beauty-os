// Offline V1 wording (ADR-0010 §11). Until Registar serviço works offline (Offline 4), nothing here says that work is
// kept on the device in general; counts describe only what is actually stored.
import type { LocalStatus } from '../offline/status'

export const OFFLINE_TITLE = 'Sem ligação'
export const OFFLINE_SUPPORT = 'Algumas ações precisam de ligação.'
export const PRIVATE_NEEDS_CONNECTION = 'A área privada precisa de ligação.'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Hoje's rows for local work, kept apart: services waiting to be sent, and movements waiting for a PIN (Offline 6). */
export function pendingRows(local: LocalStatus | null): { send: string | null; confirm: string | null; confirmReview: string | null } {
  if (!local) return { send: null, confirm: null, confirmReview: null }
  return {
    send: local.outboxPending > 0 ? `${plural(local.outboxPending, 'registo', 'registos')} por enviar` : null,
    confirm: local.draftsPending > 0 ? `${local.draftsPending} por confirmar com PIN` : null,
    confirmReview: local.draftsReview > 0 ? `${local.draftsReview} ${local.draftsReview === 1 ? 'precisa' : 'precisam'} de revisão` : null,
  }
}
