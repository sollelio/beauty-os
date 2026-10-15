// Module `team` access layer: personal advances (Slice 02).
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export type RecordAdvanceInput = { personId: string; amountMinor: number; paymentMethodId: string; note: string | null }
export type RecordAdvanceResult = { advance_id: string; occurred_at: string; confirmed_by_person_id: string; replayed?: boolean }

/** `occurredAt`: only for a draft confirmed online (its capture time, ADR-0010 §3); omitted, the server's time. */
export async function recordAdvance(commandId: string, grantId: string, input: RecordAdvanceInput, occurredAt?: string): Promise<RecordAdvanceResult> {
  const { data, error } = await getSupabase().rpc('record_advance', {
    p_command_id: commandId,
    p_grant_id: grantId,
    p_person_id: input.personId,
    p_amount_minor: input.amountMinor,
    p_payment_method_id: input.paymentMethodId,
    p_note: input.note,
    ...(occurredAt ? { p_occurred_at: occurredAt } : {}),
  })
  if (error) throw toAppError(error)
  return data as RecordAdvanceResult
}
