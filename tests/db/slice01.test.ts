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
    for (const t of ['organizations', 'people', 'services', 'service_records', 'payment_methods']) {
      const { data, error } = await unbound.from(t).select('id')
      expect(error).toBeNull()
      expect(data).toEqual([])
    }
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
    const mine = await devA.from('service_records').select('id, organization_id, value_minor, payment_kind, declared_operator_id').eq('id', id)
    expect(mine.data).toEqual([{ id, organization_id: A.org, value_minor: 100000, payment_kind: 'single', declared_operator_id: null }])
    expect((await devB.from('service_records').select('id').eq('id', id)).data).toEqual([])
    const summary = (await devA.rpc('hoje_service_summary')).data
    expect(summary.recent.some((x: { id: string }) => x.id === id)).toBe(true)
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
    const kind = await devA.from('service_records').select('payment_kind').eq('id', good.data.record_id).single()
    expect(kind.data?.payment_kind).toBe('mixed')
  })

  it('replays the same command_id with the same payload and returns the original result', async () => {
    const cmd = randomUUID()
    const first = await record(devA, okArgs(cmd))
    const again = await record(devA, okArgs(cmd))
    expect(again.error).toBeNull()
    expect(again.data.record_id).toBe(first.data.record_id)
    expect(again.data.replayed).toBe(true)
    expect((await devA.from('service_records').select('id').eq('command_id', cmd)).data).toHaveLength(1)
  })

  it('rejects the same command_id with a different payload, or from another device', async () => {
    const cmd = randomUUID()
    await record(devA, okArgs(cmd))
    expect((await record(devA, okArgs(cmd, 200000))).error?.message).toBe('IDEMPOTENCY_CONFLICT')
    expect((await record(devB, { ...okArgs(cmd), p_person_id: B.person, p_service_id: B.service, p_payments: [{ method_id: B.cash, amount_minor: 100000 }] })).error?.message).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('executes concurrent duplicates once', async () => {
    const cmd = randomUUID()
    const results = await Promise.all(Array.from({ length: 6 }, () => record(devA, okArgs(cmd))))
    expect(results.every((r) => r.error === null)).toBe(true)
    expect(new Set(results.map((r) => r.data.record_id)).size).toBe(1)
    expect((await devA.from('service_records').select('id').eq('command_id', cmd)).data).toHaveLength(1)
  })
})
