// Module `services` access layer: the record_service command and Slice 01 read contracts.
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export type PaymentPart = { method_id: string; amount_minor: number }
export type RecordServiceInput = {
  personId: string; serviceId: string; valueMinor: number; payments: PaymentPart[]
}
export type RecordServiceResult = { record_id: string; occurred_at: string; replayed?: boolean }

export type HojeSummary = {
  total: number
  last_at: string | null
  by_method: { code: string; label: string | null; count: number }[]
  recent: {
    id: string; occurred_at: string; service_name: string; person_name: string
    payment_kind: 'single' | 'mixed'; method_label: string | null; value_minor: number
  }[]
}
export type CapturePerson = { id: string; display_name: string; capabilities: string[] }
export type FrequentService = { id: string; name: string; default_price_minor: number }
export type PaymentMethod = { id: string; code: string; label: string }

export const servicesKeys = {
  all: ['services'] as const,
  hoje: ['services', 'hoje'] as const,
  people: ['services', 'capture-people'] as const,
  frequent: (personId: string) => ['services', 'frequent', personId] as const,
  paymentMethods: ['services', 'payment-methods'] as const,
}

export async function recordService(commandId: string, input: RecordServiceInput): Promise<RecordServiceResult> {
  const { data, error } = await getSupabase().rpc('record_service', {
    p_command_id: commandId,
    p_person_id: input.personId,
    p_service_id: input.serviceId,
    p_value_minor: input.valueMinor,
    p_payments: input.payments,
  })
  if (error) throw toAppError(error)
  return data as RecordServiceResult
}

export async function getHojeSummary(): Promise<HojeSummary | null> {
  const { data, error } = await getSupabase().rpc('hoje_service_summary', { p_recent_limit: 4 })
  if (error) throw toAppError(error)
  return data as HojeSummary | null
}

export async function listCapturePeople(): Promise<CapturePerson[]> {
  const { data, error } = await getSupabase().rpc('capture_people')
  if (error) throw toAppError(error)
  return data as CapturePerson[]
}

export async function listFrequentServices(personId: string): Promise<FrequentService[]> {
  const { data, error } = await getSupabase().rpc('frequent_services', { p_person_id: personId, p_limit: 5 })
  if (error) throw toAppError(error)
  return data as FrequentService[]
}

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  const { data, error } = await getSupabase()
    .from('payment_methods').select('id, code, label').eq('active', true).order('sort_order')
  if (error) throw toAppError(error)
  return data
}
