// Module `stock` access layer: product identity for purchase capture (no stock state yet — Slice 05).
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export type Product = { id: string; name: string; unit_word: string }

export const stockKeys = { products: ['stock', 'products'] as const, unitWords: ['stock', 'unit-words'] as const }

export async function listProducts(): Promise<Product[]> {
  const { data, error } = await getSupabase().from('products').select('id, name, unit_word').order('name')
  if (error) throw toAppError(error)
  return data
}

export async function listUnitWords(): Promise<string[]> {
  const { data, error } = await getSupabase().from('unit_words').select('word').order('sort_order')
  if (error) throw toAppError(error)
  return data.map((w) => w.word)
}
