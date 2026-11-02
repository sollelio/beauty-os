// Production by payment method in the Fecho (20261102000100) through the public API, over the services earlier runs
// recorded with record_service in the synthetic "Outubro Teste" period of org A (single and mixed payments). The exact
// cases — one or two methods, mixed parts, cancelled records, approved and closed periods, parts that do not match —
// are in tests/sql/fecho_production_methods_probe.sql.
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { device } from './env'

const id = (s: string) => `00000000-0000-4000-8000-00000000${s}`
const OCT = '00000000-0000-4000-8000-0000000ca802'
type Row = Record<string, any>                                  // eslint-disable-line @typescript-eslint/no-explicit-any
let dev: SupabaseClient

beforeAll(async () => {
  dev = await device('TEST-ORG-A-2026')
  expect((await dev.rpc('verify_person', { p_person_id: id('a205'), p_secret: '666666', p_scope: 'private_session' })).data?.ok).toBe(true)
})

describe('production by payment method', () => {
  it('needs the same private context as the rest of the Fecho; the helper is not reachable from the API', async () => {
    const fresh = await device('TEST-ORG-A-2026')
    expect((await fresh.rpc('fecho_period', { p_period_id: OCT })).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await fresh.rpc('verify_person', { p_person_id: id('a201'), p_secret: '111111', p_scope: 'private_session' })).data?.ok).toBe(true)
    expect((await fresh.rpc('fecho_period', { p_period_id: OCT })).error?.message).toBe('NOT_AUTHORIZED')        // own view only
    expect((await dev.rpc('period_production_by_method', { p_org: id('00a1'), p_period: null, p_pos: {} })).error).not.toBeNull()
    expect((await dev.schema('private').rpc('period_production_by_method', { p_org: id('00a1'), p_period: null, p_pos: {} })).error).not.toBeNull()
  })

  it('one entry per professional of the Fecho, reconciled, the methods adding up to the production total', async () => {
    const r = await dev.rpc('fecho_period', { p_period_id: OCT })
    expect(r.error, r.error?.message).toBeNull()
    const f = r.data as Row
    const people = f.position.people as Row[]
    const byMethod = f.production_by_method as Row[]
    expect(byMethod.map((x) => x.person_id)).toEqual(people.map((x) => x.person_id))
    expect(people.some((x) => x.production.count > 0)).toBe(true)
    expect(byMethod.some((x) => x.mixed_count > 0)).toBe(true)                    // mixed services are split by their parts
    for (const x of byMethod) {
      const p = people.find((y) => y.person_id === x.person_id)!
      expect(x.reconciled, p.display_name).toBe(true)
      expect((x.methods as Row[]).reduce((s, m) => s + m.amount_minor, 0)).toBe(p.production.total_minor)
      for (const m of x.methods as Row[]) expect(Object.keys(m).sort()).toEqual(['amount_minor', 'code', 'count', 'label'])
    }
  })
})
