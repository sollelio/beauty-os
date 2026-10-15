// Offline V1 wording (ADR-0010 §11). Until Registar serviço works offline (Offline 4), nothing here says that work is
// kept on the device in general; counts describe only what is actually stored.
import type { LocalStatus } from '../offline/status'

export const OFFLINE_TITLE = 'Sem ligação'
export const OFFLINE_SUPPORT = 'Algumas ações precisam de ligação.'
export const PRIVATE_NEEDS_CONNECTION = 'A área privada precisa de ligação.'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Hoje's rows for local work, kept apart and never overlapping (Offline 7): services waiting to be sent, movements
 *  waiting for a PIN, and what the server refused and a person has to review. */
export function pendingRows(local: LocalStatus | null): { send: string | null; confirm: string | null; review: string | null } {
  if (!local) return { send: null, confirm: null, review: null }
  const send = local.outboxPending - local.outboxConflicts, confirm = local.draftsPending - local.draftsReview
  const review = local.outboxConflicts + local.draftsReview
  return {
    send: send > 0 ? `${plural(send, 'registo', 'registos')} por enviar` : null,
    confirm: confirm > 0 ? `${confirm} por confirmar com PIN` : null,
    review: review > 0 ? `${review} para rever` : null,
  }
}
