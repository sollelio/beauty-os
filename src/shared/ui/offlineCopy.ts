// Offline V1 wording (ADR-0010 §11). Until Registar serviço works offline (Offline 4), nothing here says that work is
// kept on the device in general; counts describe only what is actually stored.
import type { LocalStatus } from '../offline/status'

export const OFFLINE_TITLE = 'Sem ligação'
export const OFFLINE_SUPPORT = 'Algumas ações precisam de ligação.'
export const PRIVATE_NEEDS_CONNECTION = 'A área privada precisa de ligação.'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The Hoje row for local work, or null when there is none. */
export function pendingLine(local: LocalStatus | null): { title: string; subtitle: string | null } | null {
  if (!local) return null
  const sent = local.outboxPending, drafts = local.draftsPending
  const confirm = drafts > 0 ? `${plural(drafts, 'movimento', 'movimentos')} por confirmar com PIN` : null
  if (sent > 0) return { title: `${plural(sent, 'registo', 'registos')} por enviar`, subtitle: confirm }
  if (confirm) return { title: confirm, subtitle: null }
  return null
}
