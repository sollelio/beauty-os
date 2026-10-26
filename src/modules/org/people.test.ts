// Purchase contributors (Slice 3): active salon personnel only — a support identity is never a contributor.
import { describe, expect, it, vi } from 'vitest'

const calls: [string, ...unknown[]][] = []
const chain = {
  select: (...a: unknown[]) => (calls.push(['select', ...a]), chain),
  eq: (...a: unknown[]) => (calls.push(['eq', ...a]), chain),
  order: async (...a: unknown[]) => (calls.push(['order', ...a]), { data: [{ id: 'f', display_name: 'Fernando' }], error: null }),
}
vi.mock('../../shared/supabase/client', () => ({ getSupabase: () => ({ from: (t: string) => (calls.push(['from', t]), chain) }) }))
import { listPeople } from './api'

describe('purchase contributors', () => {
  it('asks the database for active personnel only', async () => {
    expect(await listPeople()).toEqual([{ id: 'f', display_name: 'Fernando' }])
    expect(calls).toEqual([['from', 'people'], ['select', 'id, display_name'], ['eq', 'active', true], ['eq', 'kind', 'personnel'], ['order', 'display_name']])
  })
})
