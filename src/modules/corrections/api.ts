// Pilot corrections: cancel (anular) a mistaken record while its period is Aberto. Nothing is deleted; the original
// stays in the history marked as cancelled; the corrected record is captured again through the normal flow.
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export type RecordKind = 'service' | 'advance' | 'expense' | 'purchase'
export const KIND_LABEL: Record<RecordKind, string> = { service: 'Serviço', advance: 'Adiantamento', expense: 'Despesa', purchase: 'Compra' }
export const RECAPTURE_PATH: Record<RecordKind, string> = {
  service: '/servicos/registar', advance: '/equipa/adiantamento', expense: '/dinheiro/despesa', purchase: '/dinheiro/compra',
}
export type RecordSummary = {
  kind: RecordKind; occurred_at: string; amount_minor: number; title: string; person: string | null; line_count?: number
  cancelled: { at: string; reason: string; by: string } | null
}
export type CancelInput = { kind: RecordKind; recordId: string; reason: string }

export const correctionKeys = { summary: (kind: string, id: string) => ['corrections', kind, id] as const }

export async function getRecordSummary(kind: RecordKind, recordId: string): Promise<RecordSummary> {
  const { data, error } = await getSupabase().rpc('record_summary', { p_kind: kind, p_record_id: recordId })
  if (error) throw toAppError(error)
  return data as RecordSummary
}

export async function cancelRecord(commandId: string, grantId: string, i: CancelInput) {
  const { data, error } = await getSupabase().rpc('cancel_record', { p_command_id: commandId, p_grant_id: grantId, p_kind: i.kind, p_record_id: i.recordId, p_reason: i.reason })
  if (error) throw toAppError(error)
  return data as { cancellation_id: string; cancelled_at: string; replayed?: boolean }
}
