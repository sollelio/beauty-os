// Module `team` access layer: personal advances (Slice 02).
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export type RecordAdvanceInput = { personId: string; amountMinor: number; paymentMethodId: string; note: string | null }
export type RecordAdvanceResult = { advance_id: string; occurred_at: string; confirmed_by_person_id: string; replayed?: boolean }

export async function recordAdvance(commandId: string, input: RecordAdvanceInput): Promise<RecordAdvanceResult> {
  const { data, error } = await getSupabase().rpc('record_advance', {
    p_command_id: commandId,
    p_person_id: input.personId,
    p_amount_minor: input.amountMinor,
    p_payment_method_id: input.paymentMethodId,
    p_note: input.note,
  })
  if (error) throw toAppError(error)
  return data as RecordAdvanceResult
}
