import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { A, B, device } from './env'

// Synthetic test people/secrets (supabase/seeds/02_slice02.sql, 03_slice02_second_confirmer.sql)
const A_CONFIRMER = '00000000-0000-4000-8000-00000000a202'   // movement.confirm, PIN 222222
const A_CONFIRMER_2 = '00000000-0000-4000-8000-00000000a204' // movement.confirm, PIN 555555
const A_LOCKME = '00000000-0000-4000-8000-00000000a203'      // movement.confirm, PIN 333333 (lockout test only)
const A_NOPERM = A.person                                     // PIN 111111, no permission
const B_CONFIRMER = '00000000-0000-4000-8000-00000000b202'   // PIN 444444

let devA: SupabaseClient, devA2: SupabaseClient, devB: SupabaseClient, unbound: SupabaseClient

const verify = (c: SupabaseClient, person: string, secret: string) => c.rpc('verify_person', { p_person_id: person, p_secret: secret })
async function grantFor(c: SupabaseClient, person: string, secret: string): Promise<string> {
  const r = await verify(c, person, secret)
  expect(r.data?.ok).toBe(true)
  return r.data.grant_id as string
}
const advance = (c: SupabaseClient, cmd: string, grant: string | null, over: Record<string, unknown> = {}) => c.rpc('record_advance', {
  p_command_id: cmd, p_grant_id: grant, p_person_id: A.person, p_amount_minor: 1000000, p_payment_method_id: A.cash, p_note: 'teste', ...over,
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
    expect((await advance(unbound, randomUUID(), randomUUID())).error?.message).toBe('NOT_AUTHORIZED')
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
  it('returns the id of the one-shot grant it created', async () => {
    const r = await verify(devA, A_CONFIRMER, '222222')
    expect(r.data).toMatchObject({ ok: true, scope: 'one_shot' })
    expect(r.data.grant_id).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('record_advance authorization', () => {
  it('requires a grant: a bound device alone, a declared operator, or a made-up grant id is not enough', async () => {
    expect((await advance(devA, randomUUID(), null)).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await advance(devA, randomUUID(), null, { p_declared_operator_id: A_CONFIRMER })).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await advance(devA, randomUUID(), randomUUID())).error?.message).toBe('VERIFICATION_REQUIRED')
  })
  it('requires the confirm permission of the verified person', async () => {
    const g = await grantFor(devA, A_NOPERM, '111111')
    expect((await advance(devA, randomUUID(), g)).error?.message).toBe('NOT_AUTHORIZED')
  })
  it('consumes exactly the presented grant once, only on its own device; replay needs no grant', async () => {
    const g = await grantFor(devA, A_CONFIRMER, '222222')
    expect((await advance(devA2, randomUUID(), g)).error?.message).toBe('VERIFICATION_REQUIRED')   // other device
    const cmd = randomUUID()
    const r = await advance(devA, cmd, g)
    expect(r.error).toBeNull()
    expect(r.data.confirmed_by_person_id).toBe(A_CONFIRMER)
    expect((await advance(devA, randomUUID(), g)).error?.message).toBe('VERIFICATION_REQUIRED')    // consumed
    // ADR-0006: replay after the grant was consumed returns the original result, no new mutation, no grant needed
    for (const grant of [g, null]) {
      const again = await advance(devA, cmd, grant)
      expect(again.error).toBeNull()
      expect(again.data.advance_id).toBe(r.data.advance_id)
      expect(again.data.replayed).toBe(true)
    }
    expect((await advance(devA, cmd, null, { p_amount_minor: 2000000 })).error?.message).toBe('IDEMPOTENCY_CONFLICT')
  })
  it('a newer verification supersedes an unused earlier grant on the same device session', async () => {
    const g1 = await grantFor(devA, A_CONFIRMER, '222222')
    const g2 = await grantFor(devA, A_NOPERM, '111111')
    expect((await advance(devA, randomUUID(), g1)).error?.message).toBe('VERIFICATION_REQUIRED')   // superseded
    expect((await advance(devA, randomUUID(), g2)).error?.message).toBe('NOT_AUTHORIZED')          // latest has no permission
  })
  it('a retry after another person verified on the same session is never authorized by that person', async () => {
    const g1 = await grantFor(devA, A_CONFIRMER, '222222')
    const cmd = randomUUID()
    // the first attempt fails without committing (here: a rejected reference), so g1 stays unused
    expect((await advance(devA, cmd, g1, { p_person_id: B.person })).error?.message).toBe('CROSS_TENANT_REFERENCE')
    const g2 = await grantFor(devA, A_CONFIRMER_2, '555555')                                       // someone else verifies
    expect((await advance(devA, cmd, g1)).error?.message).toBe('VERIFICATION_REQUIRED')            // earlier retry refused
    const g3 = await grantFor(devA, A_CONFIRMER, '222222')                                         // original confirmer again
    const r = await advance(devA, cmd, g3)
    expect(r.error).toBeNull()
    expect(r.data.confirmed_by_person_id).toBe(A_CONFIRMER)
    expect((await advance(devA, randomUUID(), g2)).error?.message).toBe('VERIFICATION_REQUIRED')   // g2 was superseded by g3
  })
  it('concurrent verifications leave exactly one usable grant', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => verify(devA, A_CONFIRMER, '222222')))
    const grants = results.map((r) => r.data.grant_id as string)
    expect(results.every((r) => r.data.ok === true)).toBe(true)
    expect(new Set(grants).size).toBe(6)
    let usable = 0
    for (const g of grants) if ((await advance(devA, randomUUID(), g)).error === null) usable++
    expect(usable).toBe(1)
  })
  it('rejects references from another organization', async () => {
    for (const over of [{ p_person_id: B.person }, { p_payment_method_id: B.cash }, { p_declared_operator_id: B_CONFIRMER }]) {
      const g = await grantFor(devA, A_CONFIRMER, '222222')
      expect((await advance(devA, randomUUID(), g, over)).error?.message).toBe('CROSS_TENANT_REFERENCE')
    }
  })
  it('validates amount and note', async () => {
    const g = await grantFor(devA, A_CONFIRMER, '222222')
    expect((await advance(devA, randomUUID(), g, { p_amount_minor: 0 })).error?.message).toBe('VALIDATION_FAILED')
    expect((await advance(devA, randomUUID(), g, { p_note: 'x'.repeat(61) })).error?.message).toBe('VALIDATION_FAILED')
  })
  it('isolates organizations: Org B confirmer works on Org B only', async () => {
    const g = await grantFor(devB, B_CONFIRMER, '444444')
    expect((await advance(devA, randomUUID(), g)).error?.message).toBe('VERIFICATION_REQUIRED')    // Org B grant on Org A device
    const r = await devB.rpc('record_advance', { p_command_id: randomUUID(), p_grant_id: g, p_person_id: B.person, p_amount_minor: 500000, p_payment_method_id: B.cash })
    expect(r.error).toBeNull()
    expect(r.data.confirmed_by_person_id).toBe(B_CONFIRMER)
  })
  it('refuses an expired grant', { timeout: 200_000 }, async () => {
    const g = await grantFor(devA, A_CONFIRMER, '222222')
    await new Promise((r) => setTimeout(r, 125_000))                                              // grant lifetime is 120 s
    expect((await advance(devA, randomUUID(), g)).error?.message).toBe('VERIFICATION_REQUIRED')
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
