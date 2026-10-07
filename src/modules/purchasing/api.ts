// Module `purchasing` access layer: the purchase aggregate (Slice 03).
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export type PurchaseOrigin = { id: string; label: string }
export type PurchaseLineInput =
  | { product_id: string; quantity: number; line_cost_minor: number }
  | { new_product: { name: string; unit_word: string }; quantity: number; line_cost_minor: number }
export type RecordPurchaseInput = {
  lines: PurchaseLineInput[]
  salonAmountMinor: number
  contributions: { person_id: string; amount_minor: number }[]
  originId: string | null
}
export type RecordPurchaseResult = {
  purchase_id: string; occurred_at: string; total_minor: number; line_count: number; new_product_count: number
  salon_amount_minor: number; contributors: { person_id: string; display_name: string; amount_minor: number }[]
  confirmed_by_person_id: string; replayed?: boolean
}

export const purchasingKeys = { origins: ['purchasing', 'origins'] as const }

export async function listPurchaseOrigins(): Promise<PurchaseOrigin[]> {
  const { data, error } = await getSupabase().from('purchase_origins').select('id, label').eq('active', true).order('sort_order')
  if (error) throw toAppError(error)
  return data
}

export async function recordPurchase(commandId: string, grantId: string, input: RecordPurchaseInput): Promise<RecordPurchaseResult> {
  const { data, error } = await getSupabase().rpc('record_purchase', {
    p_command_id: commandId, p_grant_id: grantId, p_lines: input.lines,
    p_salon_amount_minor: input.salonAmountMinor, p_contributions: input.contributions, p_origin_id: input.originId,
  })
  if (error) throw toAppError(error)
  return data as RecordPurchaseResult
}
