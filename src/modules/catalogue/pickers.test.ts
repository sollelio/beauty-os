// The operational pickers (Registar serviço, Registar compra, Stock) read active catalogue entries only, so an entry
// deactivated in Gestão leaves the new choices and keeps its history (07 D8; the database refuses it on a new record
// too — tests/db/catalogue.test.ts). Gestão itself reads every entry.
import { describe, expect, it, vi } from 'vitest'

const calls: { table: string; filters: [string, unknown][] }[] = []
function chain(table: string) {
  const c = { table, filters: [] as [string, unknown][] }
  calls.push(c)
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => { c.filters.push([k, v]); return q },
    order: () => q,
    then: (res: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(res),
  }
  return q
}
vi.mock('../../shared/supabase/client', () => ({ getSupabase: () => ({ from: (t: string) => chain(t) }) }))
import { listManagedProducts, listManagedServices, listServices } from './api'
import { listProducts } from '../stock/api'

describe('operational pickers vs Gestão', () => {
  it('services and products offered to new records are the active ones; Gestão reads them all', async () => {
    calls.length = 0
    await listServices(); await listProducts(); await listManagedServices(); await listManagedProducts()
    expect(calls.map((c) => [c.table, c.filters])).toEqual([
      ['services', [['active', true]]], ['products', [['active', true]]], ['services', []], ['products', []],
    ])
  })
})
