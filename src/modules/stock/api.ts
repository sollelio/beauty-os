// Module `stock` access layer: product identity (Slice 03) and Stock Lite (Slice 05). State, level, reserve units
// and the plan are human-set direct writes under RLS (Architecture Definition §315); purchase facts are read models
// over Slice 03 purchase lines. Nothing here is computed from services or purchases.
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export type Product = { id: string; name: string; unit_word: string }
export type StockState = 'ok' | 'baixo' | 'comprar'
export type StockLevel = 'cheio' | 'metade' | 'quase_vazio' | 'vazio'
export type PurchaseFact = { occurred_at: string; quantity: number; unit_word: string; line_cost_minor: number; origin: string | null }
export type StockProduct = Product & {
  purpose: string | null; state: StockState; level: StockLevel | null; reserve_units: number; marked_at: string | null
  on_list: boolean; planned_qty: number | null; urgent: boolean
  last_purchase: PurchaseFact | null; bought_today: { quantity: number; unit_word: string } | null
}
export type StockEdit = Partial<Pick<StockProduct, 'state' | 'level' | 'reserve_units' | 'on_list' | 'planned_qty' | 'urgent'>>
export type ProductHistory = { purchases: PurchaseFact[]; mark: { state: StockState; marked_at: string; days_after_purchase: number | null } | null }

export const stockKeys = {
  products: ['stock', 'products'] as const,
  unitWords: ['stock', 'unit-words'] as const,
  overview: ['stock', 'overview'] as const,
  toBuy: ['stock', 'to-buy-count'] as const,
  history: (id: string) => ['stock', 'history', id] as const,
}

export const STOCK_FOOTNOTE = 'O estado é aproximado e marcado por quem vê o produto. Não há contagem automática.'
export const STATE_LABEL: Record<StockState, string> = { ok: 'OK', baixo: 'Baixo', comprar: 'Comprar' }
export const LEVEL_LABEL: Record<StockLevel, string> = { cheio: 'Cheio', metade: 'Metade', quase_vazio: 'Quase vazio', vazio: 'Vazio' }

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

export async function getStockOverview(): Promise<StockProduct[]> {
  const { data, error } = await getSupabase().rpc('stock_overview')
  if (error) throw toAppError(error)
  return data as StockProduct[]
}

export async function updateStock(productId: string, edit: StockEdit): Promise<void> {
  const { data, error } = await getSupabase().from('products').update(edit).eq('id', productId).select('id')
  if (error) throw toAppError(error)
  if (!data?.length) throw toAppError({ message: 'NOT_AUTHORIZED' })
}

export async function createProduct(name: string, unitWord: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_product', { p_name: name, p_unit_word: unitWord })
  if (error) throw toAppError(error)
  return (data as { product_id: string }).product_id
}

export async function getProductHistory(productId: string): Promise<ProductHistory> {
  const { data, error } = await getSupabase().rpc('product_purchase_history', { p_product_id: productId, p_limit: 5 })
  if (error) throw toAppError(error)
  return data as ProductHistory
}

/** Hoje's Atenção row: how many products are marked Comprar (names and figures stay in Stock). */
export async function countMarkedToBuy(): Promise<number> {
  const { count, error } = await getSupabase().from('products').select('id', { count: 'exact', head: true }).eq('state', 'comprar')
  if (error) throw toAppError(error)
  return count ?? 0
}

/** Row note: "comprado hoje · 2 unid. · quase vazio", "metade · 1 em reserva", or the unit word when nothing is set. */
export function productNote(p: StockProduct): string {
  const parts = [
    ...(p.bought_today ? [`comprado hoje · ${p.bought_today.quantity} ${p.bought_today.unit_word}`] : []),
    ...(p.level ? [LEVEL_LABEL[p.level].toLocaleLowerCase('pt-PT')] : []),
    ...(p.reserve_units > 0 ? [`${p.reserve_units} em reserva`] : []),
  ]
  return parts.length ? parts.join(' · ') : p.unit_word
}
