// Module `catalogue` access layer.
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export type CatalogueService = { id: string; name: string; default_price_minor: number }

export const catalogueKeys = { services: ['catalogue', 'services'] as const }

export async function listServices(): Promise<CatalogueService[]> {
  const { data, error } = await getSupabase()
    .from('services').select('id, name, default_price_minor').eq('active', true).order('sort_order').order('name')
  if (error) throw toAppError(error)
  return data
}
