// Module `catalogue` access layer. Capture reads active services only. Gestão reads every entry (inactive ones stay,
// because records reference them) and changes them only through the catalogue commands, confirmed by a person
// holding catalogue.manage (one-shot grant, ADR-0009; one command_id per intent, ADR-0006). A price here is the
// prefill for the next capture: recorded values never change.
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export type CatalogueService = { id: string; name: string; default_price_minor: number }
export type ManagedService = CatalogueService & { active: boolean; sort_order: number }
export type ManagedProduct = { id: string; name: string; unit_word: string; reference_price_minor: number | null; active: boolean }

export const catalogueKeys = {
  services: ['catalogue', 'services'] as const,
  managedServices: ['catalogue', 'managed-services'] as const,
  managedProducts: ['catalogue', 'managed-products'] as const,
}

export async function listServices(): Promise<CatalogueService[]> {
  const { data, error } = await getSupabase()
    .from('services').select('id, name, default_price_minor').eq('active', true).order('sort_order').order('name')
  if (error) throw toAppError(error)
  return data
}

export async function listManagedServices(): Promise<ManagedService[]> {
  const { data, error } = await getSupabase()
    .from('services').select('id, name, default_price_minor, active, sort_order').order('sort_order').order('name')
  if (error) throw toAppError(error)
  return data
}

export async function listManagedProducts(): Promise<ManagedProduct[]> {
  const { data, error } = await getSupabase()
    .from('products').select('id, name, unit_word, reference_price_minor, active').order('name')
  if (error) throw toAppError(error)
  return data
}

export type ServiceInput = { id: string | null; name: string; price_minor: number; active: boolean }
export type ProductInput = { id: string | null; name: string; unit_word: string; reference_price_minor: number | null; active: boolean }

async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await getSupabase().rpc(fn, args)
  if (error) throw toAppError(error)
  return data as Record<string, unknown>
}

export function saveService(commandId: string, grantId: string, s: ServiceInput) {
  return s.id === null
    ? call('catalogue_add_service', { p_command_id: commandId, p_grant_id: grantId, p_name: s.name, p_price_minor: s.price_minor })
    : call('catalogue_update_service', { p_command_id: commandId, p_grant_id: grantId, p_service_id: s.id, p_name: s.name,
                                         p_price_minor: s.price_minor, p_active: s.active })
}

export function saveProduct(commandId: string, grantId: string, p: ProductInput) {
  return p.id === null
    ? call('catalogue_add_product', { p_command_id: commandId, p_grant_id: grantId, p_name: p.name, p_unit_word: p.unit_word,
                                      p_reference_price_minor: p.reference_price_minor })
    : call('catalogue_update_product', { p_command_id: commandId, p_grant_id: grantId, p_product_id: p.id, p_name: p.name,
                                         p_unit_word: p.unit_word, p_reference_price_minor: p.reference_price_minor, p_active: p.active })
}
