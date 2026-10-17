import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { A, B, client, device } from './env'

let pub: SupabaseClient, unbound: SupabaseClient, devA: SupabaseClient, devB: SupabaseClient

const record = (c: SupabaseClient, args: Record<string, unknown>) => c.rpc('record_service', args)
const okArgs = (cmd: string, value = 100000) => ({
  p_command_id: cmd, p_person_id: A.person, p_service_id: A.service, p_value_minor: value,
  p_payments: [{ method_id: A.cash, amount_minor: value }],
})
// The service history is not readable directly (S3b): devices see today's records through Hoje's summary.
type HojeRow = { id: string } & Record<string, unknown>
const hoje = async (c: SupabaseClient) =>
  (await c.rpc('hoje_service_summary', { p_recent_limit: 1000 })).data as { total: number; recent: HojeRow[] }

beforeAll(async () => {
  pub = client()
  unbound = await device(null)
  devA = await device('TEST-ORG-A-2026')
  devB = await device('TEST-ORG-B-2026')
})

describe('no session (publishable key only)', () => {
  it('cannot read tenant data', async () => {
    for (const t of ['organizations', 'people', 'services', 'service_records']) {
      const { data, error } = await pub.from(t).select('id')
      expect(error?.code ?? (data?.length === 0 ? 'empty' : 'rows')).toMatch(/42501|empty/)
    }
  })
  it('cannot call commands', async () => {
    const { error } = await record(pub, okArgs(randomUUID()))
    expect(error?.code).toBe('42501')
  })
})

describe('unbound anonymous device', () => {
  it('sees no tenant data', async () => {
    for (const t of ['organizations', 'people', 'services', 'payment_methods']) {
      const { data, error } = await unbound.from(t).select('id')
      expect(error).toBeNull()
      expect(data).toEqual([])
    }
    // the service history is not a table any device can select (S3b): refused, not merely filtered
    const history = await unbound.from('service_records').select('id')
    expect(history.error?.code).toBe('42501')
    expect(history.data).toBeNull()
    expect((await unbound.rpc('device_context')).data).toEqual({ bound: false })
    expect((await unbound.rpc('hoje_service_summary')).data).toBeNull()
  })
  it('cannot record a service', async () => {
    expect((await record(unbound, okArgs(randomUUID()))).error?.message).toBe('NOT_AUTHORIZED')
  })
  it('cannot redeem an invalid code', async () => {
    const c = await device(null)
    expect((await c.rpc('redeem_enrollment', { p_code: 'NOT-A-CODE' })).error?.message).toBe('ENROLLMENT_INVALID')
  })
})

describe('bound device, tenant isolation', () => {
  it('reads only its own organization', async () => {
    const ctx = (await devA.rpc('device_context')).data
    expect(ctx.bound).toBe(true)
    expect(ctx.organization.id).toBe(A.org)
    const people = (await devA.from('people').select('organization_id')).data!
    expect(people.length).toBeGreaterThan(0)
    expect(people.every((p) => p.organization_id === A.org)).toBe(true)
    expect((await devA.from('services').select('id').eq('organization_id', B.org)).data).toEqual([])
    expect((await devA.from('organizations').select('id')).data).toEqual([{ id: A.org }])
  })
  it('cannot bind a second time', async () => {
    expect((await devA.rpc('redeem_enrollment', { p_code: 'TEST-ORG-B-2026' })).error?.message).toBe('ALREADY_BOUND')
  })
})

describe('direct DML is denied', () => {
  it('cannot insert, update or delete directly', async () => {
    const ins = await devA.from('service_records').insert({
      organization_id: A.org, person_id: A.person, service_id: A.service, value_minor: 1, payment_kind: 'single',
      occurred_at: new Date().toISOString(), device_id: randomUUID(), command_id: randomUUID(),
    })
    expect(ins.error?.code).toBe('42501')
    expect((await devA.from('people').update({ display_name: 'x' }).eq('id', A.person)).error?.code).toBe('42501')
    expect((await devA.from('services').delete().eq('id', A.service)).error?.code).toBe('42501')
  })
})

describe('record_service', () => {
  it('records through the trusted command and is visible to the same organization only', async () => {
    const cmd = randomUUID()
    const r = await record(devA, okArgs(cmd))
    expect(r.error).toBeNull()
    const id = r.data.record_id
    expect((await hoje(devA)).recent.find((x) => x.id === id)).toMatchObject({ value_minor: 100000, payment_kind: 'single', person_name: 'Pessoa Teste A' })
    expect((await devA.rpc('record_summary', { p_kind: 'service', p_record_id: id })).data)
      .toMatchObject({ kind: 'service', amount_minor: 100000, person: 'Pessoa Teste A', cancelled: null })
    expect((await hoje(devB)).recent.map((x) => x.id)).not.toContain(id)
    expect((await devB.rpc('record_summary', { p_kind: 'service', p_record_id: id })).error?.message).toBe('CROSS_TENANT_REFERENCE')
    for (const c of [devA, devB]) expect((await c.from('service_records').select('id').eq('id', id)).error?.code).toBe('42501')
  })

  it('rejects references from another organization', async () => {
    const cases = [
      { ...okArgs(randomUUID()), p_person_id: B.person },
      { ...okArgs(randomUUID()), p_service_id: B.service },
      { ...okArgs(randomUUID()), p_payments: [{ method_id: B.cash, amount_minor: 100000 }] },
      { ...okArgs(randomUUID()), p_declared_operator_id: B.person },
    ]
    for (const args of cases) expect((await record(devA, args)).error?.message).toBe('CROSS_TENANT_REFERENCE')
  })

  it('does not accept organization or device identity as arguments', async () => {
    const r = await record(devA, { ...okArgs(randomUUID()), p_organization_id: B.org })
    expect(r.error?.code).toBe('PGRST202')
    const r2 = await record(devA, { ...okArgs(randomUUID()), p_device_id: randomUUID() })
    expect(r2.error?.code).toBe('PGRST202')
  })

  it('validates mixed payments', async () => {
    const bad = await record(devA, { ...okArgs(randomUUID()), p_payments: [{ method_id: A.cash, amount_minor: 60000 }, { method_id: A.transfer, amount_minor: 30000 }] })
    expect(bad.error?.message).toBe('MIXED_PAYMENT_MISMATCH')
    const good = await record(devA, { ...okArgs(randomUUID()), p_payments: [{ method_id: A.cash, amount_minor: 60000 }, { method_id: A.transfer, amount_minor: 40000 }] })
    expect(good.error).toBeNull()
    expect((await hoje(devA)).recent.find((x) => x.id === good.data.record_id))
      .toMatchObject({ payment_kind: 'mixed', method_label: null, value_minor: 100000 })
  })

  it('replays the same command_id with the same payload and returns the original result', async () => {
    const cmd = randomUUID()
    const before = (await hoje(devA)).total
    const first = await record(devA, okArgs(cmd))
    const again = await record(devA, okArgs(cmd))
    expect(again.error).toBeNull()
    expect(again.data.record_id).toBe(first.data.record_id)
    expect(again.data.replayed).toBe(true)
    expect((await hoje(devA)).total).toBe(before + 1)                                   // one record
  })

  it('rejects the same command_id with a different payload, or from another device', async () => {
    const cmd = randomUUID()
    await record(devA, okArgs(cmd))
    expect((await record(devA, okArgs(cmd, 200000))).error?.message).toBe('IDEMPOTENCY_CONFLICT')
    expect((await record(devB, { ...okArgs(cmd), p_person_id: B.person, p_service_id: B.service, p_payments: [{ method_id: B.cash, amount_minor: 100000 }] })).error?.message).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('executes concurrent duplicates once', async () => {
    const cmd = randomUUID()
    const before = (await hoje(devA)).total
    const results = await Promise.all(Array.from({ length: 6 }, () => record(devA, okArgs(cmd))))
    expect(results.every((r) => r.error === null)).toBe(true)
    expect(new Set(results.map((r) => r.data.record_id)).size).toBe(1)
    expect((await hoje(devA)).total).toBe(before + 1)                                   // one record
  })
})
