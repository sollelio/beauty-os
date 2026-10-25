// Offline 6 wording (ADR-0010 §3, §11): a movement saved without a connection is a draft on this phone, never a record.
import type { MovementBlock } from '../../modules/movements/useMovement'
import type { MovementKind } from '../../modules/movements/snapshot'
import type { AppError } from '../../shared/errors'
import { captureFailure } from '../../shared/periodLock'

export const DRAFT_SAVED_TITLE = 'Guardado neste telemóvel'
export const DRAFT_SAVED_SUPPORT = 'Por confirmar com PIN quando houver ligação.'
export const KIND_LABEL: Record<MovementKind, string> = { advance: 'Adiantamento', expense: 'Despesa', purchase: 'Compra' }

export const MOVEMENT_BLOCKED: Record<MovementBlock, string> = {
  missing: 'Sem ligação. Para guardar movimentos sem ligação, este telemóvel precisa de ter aberto o Beauty OS com ligação nas últimas 48 horas.',
  stale: 'Sem ligação. Os dados do salão neste telemóvel têm mais de 48 horas: é preciso ligação para os atualizar antes de guardar.',
  unavailable: 'Sem ligação. Este telemóvel não consegue guardar movimentos sem ligação.',
  online_only: 'Sem ligação. Este telemóvel é de apoio e só guarda movimentos com ligação.',
}

const REVIEW: Record<string, string> = {
  PERSON_INACTIVE: 'A pessoa deste movimento já não está ativa.',
  PAYMENT_METHOD_INACTIVE: 'A forma de pagamento deste movimento já não está ativa.',
  CATEGORY_INACTIVE: 'A categoria desta despesa já não está ativa.',
  ORIGIN_INACTIVE: 'O local de compra já não está ativo.',
  CAPTURE_TIME_TOO_OLD: 'Foi guardado há mais de 48 horas: já não pode ser registado com a hora original.',
  CAPTURE_TIME_IN_FUTURE: 'A hora guardada está no futuro (o relógio do telemóvel pode estar errado).',
  NOT_AUTHORIZED: 'Este telemóvel não pôde registar este movimento.',
  IDEMPOTENCY_CONFLICT: 'Este rascunho já foi enviado com outro conteúdo.',
  DEVICE_ONLINE_ONLY: 'Este telemóvel passou a ser de apoio e já não envia o que foi guardado sem ligação. Registe o movimento de novo, com ligação.',
}
/** Why a draft needs review (a server rejection kept on the draft); nothing is changed automatically. */
export const reviewText = (code: string) => REVIEW[code] ?? captureFailure({ code } as AppError, 'O servidor não aceitou este movimento.')

export const LOCKED_TEXT = 'Este rascunho já foi enviado sem resposta. Para não o registar duas vezes, confirme-o sem alterações ou descarte-o.'

/** A confirmation failure on a draft: the same messages as the review list, then the flow's own. */
export function draftFailure(err: AppError | null, fallback: string): string {
  if (!err) return fallback
  if (err.message === 'DRAFT_LOCKED') return LOCKED_TEXT
  return err.code && REVIEW[err.code] ? REVIEW[err.code]! : captureFailure(err, fallback)
}

// ---------- review (Offline 7): calm reasons for queued services; never a backend code ----------
const SERVICE_REVIEW: Record<string, string> = {
  PERSON_INACTIVE: 'A pessoa deste serviço já não está ativa.',
  SERVICE_INACTIVE: 'Este serviço já não está disponível no catálogo.',
  PAYMENT_METHOD_INACTIVE: 'A forma de pagamento já não está ativa.',
  PERIOD_APPROVED: 'O período deste serviço já tem os valores aprovados e não aceita novos registos.',
  PERIOD_CLOSED: 'O período deste serviço já está fechado e não aceita novos registos.',
  CAPTURE_TIME_TOO_OLD: 'Foi guardado há mais de 48 horas: já não pode ser registado com a hora original.',
  CAPTURE_TIME_IN_FUTURE: 'A hora guardada está no futuro (o relógio do telemóvel pode estar errado).',
  IDEMPOTENCY_CONFLICT: 'Não foi possível confirmar se este registo já foi recebido.',
  NOT_AUTHORIZED: 'Este telemóvel deixou de estar autorizado a enviar registos.',
  DEVICE_ONLINE_ONLY: 'Este telemóvel passou a ser de apoio e já não envia o que foi guardado sem ligação. Registe o serviço de novo, com ligação.',
}
export const serviceReviewText = (code: string) => SERVICE_REVIEW[code] ?? 'O servidor não aceitou este registo.'
export const DISCARD_LOCAL = 'Só é apagado deste telemóvel. Nada foi registado no servidor.'
export const DISCARD_UNCERTAIN = 'Pode já ter chegado ao servidor. Apagar remove-o só deste telemóvel — não apaga nada no servidor. Confirme primeiro, no histórico, se já está registado.'

