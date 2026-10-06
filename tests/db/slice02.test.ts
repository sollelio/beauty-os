import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { A, B, device } from './env'

// Synthetic test people/secrets (supabase/seeds/02_slice02.sql)
const A_CONFIRMER = '00000000-0000-4000-8000-00000000a202'   // movement.confirm, PIN 222222
const A_LOCKME = '00000000-0000-4000-8000-00000000a203'      // movement.confirm, PIN 333333 (lockout test only)
const A_NOPERM = A.person                                     // PIN 111111, no permission
const B_CONFIRMER = '00000000-0000-4000-8000-00000000b202'   // PIN 444444

let devA: SupabaseClient, devA2: SupabaseClient, devB: SupabaseClient, unbound: SupabaseClient

const verify = (c: SupabaseClient, person: string, secret: string) => c.rpc('verify_person', { p_person_id: person, p_secret: secret })
const advance = (c: SupabaseClient, cmd: string, over: Record<string, unknown> = {}) => c.rpc('record_advance', {
  p_command_id: cmd, p_person_id: A.person, p_amount_minor: 1000000, p_payment_method_id: A.cash, p_note: 'teste', ...over,
})

beforeAll(async () => {
  devA = await device('TEST-ORG-A-2026')
  devA2 = await device('TEST-ORG-A-2026')
  devB = await device('TEST-ORG-B-2026')
  unbound = await device(null)
})

describe('verification', () => {
  it('unbound devices cannot verify or record', async () => {
    expect((await verify(unbound, A_CONFIRMER, '222222')).data).toEqual({ ok: false, error: 'NOT_AUTHORIZED' })
    expect((await advance(unbound, randomUUID())).error?.message).toBe('NOT_AUTHORIZED')
  })
  it('rejects a wrong secret and a person of another organization without an oracle', async () => {
    expect((await verify(devA, A_CONFIRMER, '000000')).data).toEqual({ ok: false, error: 'INVALID' })
    expect((await verify(devA, B_CONFIRMER, '444444')).data).toEqual({ ok: false, error: 'INVALID' })
  })
  it('locks a person after repeated failures, even for the correct secret', async () => {
    let last: { ok: boolean; error?: string } = { ok: true }
    for (let i = 0; i < 6 && last.error !== 'LOCKED'; i++) last = (await verify(devA2, A_LOCKME, '999999')).data
    expect(last.error).toBe('LOCKED')
    expect((await verify(devA2, A_LOCKME, '333333')).data).toEqual({ ok: false, error: 'LOCKED' })
  })
})

describe('record_advance authorization', () => {
  it('requires verification: a bound device alone, or a declared operator, is not enough', async () => {
    expect((await advance(devA, randomUUID())).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await advance(devA, randomUUID(), { p_declared_operator_id: A_CONFIRMER })).error?.message).toBe('VERIFICATION_REQUIRED')
  })
  it('requires the confirm permission of the verified person', async () => {
    expect((await verify(devA, A_NOPERM, '111111')).data.ok).toBe(true)
    expect((await advance(devA, randomUUID())).error?.message).toBe('NOT_AUTHORIZED')
  })
  it('a verified confirmer records; the grant is consumed once and bound to the device', async () => {
    expect((await verify(devA, A_CONFIRMER, '222222')).data.ok).toBe(true)
    expect((await advance(devA2, randomUUID())).error?.message).toBe('VERIFICATION_REQUIRED')     // other device
    const cmd = randomUUID()
    const r = await advance(devA, cmd)
    expect(r.error).toBeNull()
    expect(r.data.confirmed_by_person_id).toBe(A_CONFIRMER)
    expect((await advance(devA, randomUUID())).error?.message).toBe('VERIFICATION_REQUIRED')      // consumed
    // ADR-0006: replay after the grant was consumed returns the original result, no new mutation
    const again = await advance(devA, cmd)
    expect(again.error).toBeNull()
    expect(again.data.advance_id).toBe(r.data.advance_id)
    expect(again.data.replayed).toBe(true)
    // same command_id, different payload
    expect((await advance(devA, cmd, { p_amount_minor: 2000000 })).error?.message).toBe('IDEMPOTENCY_CONFLICT')
  })
  it('a newer verification supersedes an unused earlier grant on the same device session', async () => {
    expect((await verify(devA, A_CONFIRMER, '222222')).data.ok).toBe(true)
    expect((await verify(devA, A_NOPERM, '111111')).data.ok).toBe(true)
    expect((await advance(devA, randomUUID())).error?.message).toBe('NOT_AUTHORIZED')   // only the latest (no permission) counts
    expect((await verify(devA, A_CONFIRMER, '222222')).data.ok).toBe(true)
    expect((await advance(devA, randomUUID())).error).toBeNull()
  })
  it('rejects references from another organization', async () => {
    for (const over of [{ p_person_id: B.person }, { p_payment_method_id: B.cash }, { p_declared_operator_id: B_CONFIRMER }]) {
      expect((await verify(devA, A_CONFIRMER, '222222')).data.ok).toBe(true)
      expect((await advance(devA, randomUUID(), over)).error?.message).toBe('CROSS_TENANT_REFERENCE')
    }
  })
  it('validates amount and note', async () => {
    expect((await verify(devA, A_CONFIRMER, '222222')).data.ok).toBe(true)
    expect((await advance(devA, randomUUID(), { p_amount_minor: 0 })).error?.message).toBe('VALIDATION_FAILED')
    expect((await advance(devA, randomUUID(), { p_note: 'x'.repeat(61) })).error?.message).toBe('VALIDATION_FAILED')
  })
  it('isolates organizations: Org B confirmer works on Org B only', async () => {
    expect((await verify(devB, B_CONFIRMER, '444444')).data.ok).toBe(true)
    const r = await devB.rpc('record_advance', { p_command_id: randomUUID(), p_person_id: B.person, p_amount_minor: 500000, p_payment_method_id: B.cash })
    expect(r.error).toBeNull()
    expect(r.data.confirmed_by_person_id).toBe(B_CONFIRMER)
  })
})

describe('advances are not directly readable or writable', () => {
  it('denies direct select and DML', async () => {
    expect((await devA.from('advances').select('id')).error?.code).toBe('42501')
    const ins = await devA.from('advances').insert({
      organization_id: A.org, person_id: A.person, amount_minor: 1, payment_method_id: A.cash, occurred_at: new Date().toISOString(),
      device_id: randomUUID(), confirmed_by_person_id: A_CONFIRMER, command_id: randomUUID(),
    })
    expect(ins.error?.code).toBe('42501')
  })
  it('does not expose verification internals', async () => {
    const r = await devA.schema('private' as never).from('verification_grants').select('id')
    expect(r.error).not.toBeNull()
  })
})
