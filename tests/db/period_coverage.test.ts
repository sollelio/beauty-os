// Slice 4 · operational records need a covering period, through the public API from a phone. Synthetic "Teste Serviços S"
// (seed 12): its four periods all ended in 2025, so today is a day without a period. The date-dependent paths (a
// Monday–Saturday week around today, offline captures, the shortening procedure) are in tests/sql/period_coverage_probe.sql.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { device } from './env'

const id = (n: string) => `00000000-0000-4000-8000-0000000055${n}`
const PRO = id('a1'), MANAGER = id('a5'), CORTE = id('b1'), CASH = id('a0')
let d: SupabaseClient
const service = (command: string) => d.rpc('record_service', { p_command_id: command, p_person_id: PRO, p_service_id: CORTE, p_value_minor: 500000,
  p_payments: [{ method_id: CASH, amount_minor: 500000 }] })

beforeAll(async () => { d = await device('TEST-ORG-S-2026') })

describe('a day covered by no period', () => {
  it('a service today is refused (NO_PERIOD_FOR_DATE) — not kept outside the period model, not moved to the last period', async () => {
    const command = randomUUID()
    expect((await service(command)).error?.message).toBe('NO_PERIOD_FOR_DATE')
    expect((await service(command)).error?.message).toBe('NO_PERIOD_FOR_DATE')          // nothing was journaled: the retry is refused again
  })
  it('the default period on such a day is the most recent one that has started — never a future one', async () => {
    expect((await d.rpc('verify_person', { p_person_id: MANAGER, p_secret: '717171', p_scope: 'private_session' })).data?.ok).toBe(true)
    const periods = (await d.rpc('fecho_periods')).data as { id: string; starts_on: string }[]
    const latest = [...periods].sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1))[0]!
    const f = await d.rpc('fecho_period', { p_period_id: null })
    expect(f.error, f.error?.message).toBeNull()
    expect(f.data.period).toMatchObject({ id: latest.id, is_current: false })
    const h = await d.rpc('business_health')
    expect(h.error, h.error?.message).toBeNull()
    expect((h.data as { current: { period: { id: string } } }).current.period.id).toBe(latest.id)
    await d.rpc('end_private_context')
  })
})
