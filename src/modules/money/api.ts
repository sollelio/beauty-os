// Module `money` access layer: operating expenses (Slice 03).
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'
import type { PaymentPart } from '../services/api'

export type ExpenseCategory = { id: string; label: string; hint: string | null }
export type RecordExpenseInput = { categoryId: string; amountMinor: number; payments: PaymentPart[]; note: string | null }
export type RecordExpenseResult = { expense_id: string; occurred_at: string; confirmed_by_person_id: string; replayed?: boolean }

export const moneyKeys = { categories: ['money', 'expense-categories'] as const }

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await getSupabase().from('expense_categories').select('id, label, hint').eq('active', true).order('sort_order')
  if (error) throw toAppError(error)
  return data
}

export async function recordExpense(commandId: string, grantId: string, input: RecordExpenseInput): Promise<RecordExpenseResult> {
  const { data, error } = await getSupabase().rpc('record_expense', {
    p_command_id: commandId, p_grant_id: grantId, p_category_id: input.categoryId,
    p_amount_minor: input.amountMinor, p_payments: input.payments, p_note: input.note,
  })
  if (error) throw toAppError(error)
  return data as RecordExpenseResult
}
