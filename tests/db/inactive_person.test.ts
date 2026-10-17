// S1 · inactive person authorization guard (migration 20261016000200, seed 20_inactive_person.sql, Dev only).
// An inactive person cannot verify a PIN, is indistinguishable from an unknown person, counts against the device, holds
// no effective permission; active people are unaffected; replays keep their idempotent answer; organizations stay
// isolated. The mid-session case (a grant obtained, then the person deactivated) needs an operator's update in the Dev
// SQL editor: it runs only with S1_MANUAL=1 (the semi-manual procedure below) and is skipped otherwise.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { A, device } from './env'

const CODE = 'TEST-ORG-INATIVO-2026'
const I = {
  pro: '00000000-0000-4000-8000-00000000fab1',      // active, beneficiary
  manager: '00000000-0000-4000-8000-00000000fab2',  // active, PIN 919191, movement.confirm + team.finance.read
  inactive: '00000000-0000-4000-8000-00000000fab3', // INACTIVE, PIN 929292, the same (dormant) permissions
  manual: '00000000-0000-4000-8000-00000000fab4',   // active, PIN 939393 — semi-manual procedure only
  cash: '00000000-0000-4000-8000-00000000faa0',
}
const PIN = { manager: '919191', inactive: '929292', manual: '939393' }

type Row = Record<string, unknown>
const verify = (c: SupabaseClient, person: string, secret: string, scope?: 'one_shot' | 'private_session') =>
  c.rpc('verify_person', { p_person_id: person, p_secret: secret, ...(scope ? { p_scope: scope } : {}) })
const advance = (c: SupabaseClient, cmd: string, grant: string | null) => c.rpc('record_advance', {
  p_command_id: cmd, p_grant_id: grant, p_person_id: I.pro, p_amount_minor: 100000, p_payment_method_id: I.cash, p_note: 'S1',
})
async function grantFor(c: SupabaseClient, person: string, pin: string): Promise<string> {
  const r = await verify(c, person, pin)
  expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
  return r.data.grant_id as string
}
const ids = (rows: unknown) => ((rows ?? []) as Row[]).map((r) => r.id)

// Anonymous sign-ins are rate-limited on Dev (30 per hour per IP), so devices are shared where state allows:
//   dev     — positive flows (grants are per device session; each test consumes or ends what it opens); its only failed
//             verification is the cross-organization probe (1)
//   dev2    — failed verifications (5 in total, below the device lock of 10) and the issuer of a "foreign" grant
//   lockDev — dedicated to the lockout test, the only one that reaches the device lock
// Every run signs in new devices, so failure counters never carry over between runs.
let dev: SupabaseClient, dev2: SupabaseClient, lockDev: SupabaseClient, devA: SupabaseClient, unbound: SupabaseClient
beforeAll(async () => {
  dev = await device(CODE)
  dev2 = await device(CODE)
  lockDev = await device(CODE)
  devA = await device('TEST-ORG-A-2026')
  unbound = await device(null)
})

describe('an inactive person cannot verify', () => {
  it('the correct PIN of an inactive person is INVALID, for both scopes', async () => {
    const c = dev2                                                                     // 2 failures on dev2
    expect((await verify(c, I.inactive, PIN.inactive)).data).toEqual({ ok: false, error: 'INVALID' })
    expect((await verify(c, I.inactive, PIN.inactive, 'private_session')).data).toEqual({ ok: false, error: 'INVALID' })
    expect((await c.rpc('private_context_status')).data).toEqual({ active: false })
  })
  it('inactive and unknown people get exactly the same public answer (no status oracle)', async () => {
    const c = dev2                                                                     // 3 more failures on dev2 (5)
    const inactiveRight = (await verify(c, I.inactive, PIN.inactive)).data
    const inactiveWrong = (await verify(c, I.inactive, '000000')).data
    const unknown = (await verify(c, randomUUID(), PIN.inactive)).data
    expect(inactiveRight).toEqual(unknown)
    expect(inactiveWrong).toEqual(unknown)
    expect(unknown).toEqual({ ok: false, error: 'INVALID' })
  })
  it('attempts on an inactive person count against the device, like unknown ones: the 10th locks it', async () => {
    const c = lockDev
    for (let i = 0; i < 10; i++) expect((await verify(c, I.inactive, PIN.inactive)).data).toEqual({ ok: false, error: 'INVALID' })
    // the device is now locked, even for an active person with the right PIN; another device is not
    expect((await verify(c, I.manager, PIN.manager)).data).toEqual({ ok: false, error: 'LOCKED' })
    expect((await verify(dev, I.manager, PIN.manager)).data?.ok).toBe(true)
  })
  it('an inactive person is never offered as a PIN holder or a confirmer', async () => {
    expect(ids((await dev.rpc('list_private_people')).data)).not.toContain(I.inactive)
    expect(ids((await dev.rpc('list_confirmers', { p_permission: 'movement.confirm' })).data)).not.toContain(I.inactive)
    expect(ids((await dev.rpc('list_confirmers', { p_permission: 'movement.confirm' })).data)).toContain(I.manager)
  })
})

describe('active people are unaffected', () => {
  it('a one-shot grant of an active person authorizes the command, once', async () => {
    const c = dev
    const g = await grantFor(c, I.manager, PIN.manager)
    const cmd = randomUUID()
    const r = await advance(c, cmd, g)
    expect(r.error).toBeNull()
    expect(r.data.confirmed_by_person_id).toBe(I.manager)
    expect((await advance(c, randomUUID(), g)).error?.message).toBe('VERIFICATION_REQUIRED')     // consumed
  })
  it('a private context of an active manager works and carries the manager view (permission held)', async () => {
    const c = dev
    expect((await verify(c, I.manager, PIN.manager, 'private_session')).data?.ok).toBe(true)
    const status = (await c.rpc('private_context_status')).data as Row
    expect(status).toMatchObject({ active: true, person_id: I.manager, view: 'manager' })
    const team = await c.rpc('team_people')
    expect(team.error).toBeNull()
    expect(ids(team.data)).toContain(I.pro)
    await c.rpc('end_private_context')
    expect((await c.rpc('team_people')).error?.message).toBe('VERIFICATION_REQUIRED')
  })
  it('a completed command replays with its original answer and needs no fresh verification', async () => {
    const c = dev
    const cmd = randomUUID()
    const first = await advance(c, cmd, await grantFor(c, I.manager, PIN.manager))
    expect(first.error).toBeNull()
    const again = await advance(c, cmd, null)
    expect(again.error).toBeNull()
    expect(again.data).toMatchObject({ advance_id: first.data.advance_id, confirmed_by_person_id: I.manager, replayed: true })
  })
  it('grant ids are still bound to their device: a made-up or foreign grant is VERIFICATION_REQUIRED', async () => {
    const c = dev
    const foreign = await grantFor(dev2, I.manager, PIN.manager)                       // dev2 has 5 failures: not locked
    expect((await advance(c, randomUUID(), foreign)).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await advance(c, randomUUID(), randomUUID())).error?.message).toBe('VERIFICATION_REQUIRED')
  })
})

describe('organization isolation', () => {
  it('a device of another organization gets the unknown-person answer for this organization\'s people, active or not', async () => {
    expect((await verify(devA, I.inactive, PIN.inactive)).data).toEqual({ ok: false, error: 'INVALID' })
    expect((await verify(devA, I.manager, PIN.manager)).data).toEqual({ ok: false, error: 'INVALID' })
    expect(ids((await devA.rpc('list_private_people')).data)).not.toContain(I.manager)
  })
  it('this organization\'s device cannot verify another organization\'s person', async () => {
    expect((await verify(dev, A.person, '111111')).data).toEqual({ ok: false, error: 'INVALID' })
  })
  it('an unbound principal is still NOT_AUTHORIZED', async () => {
    expect((await verify(unbound, I.manager, PIN.manager)).data).toEqual({ ok: false, error: 'NOT_AUTHORIZED' })
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Semi-manual procedure (approved): mid-session revocation. Run with  S1_MANUAL=1 npm run test:db -- inactive_person
// and, when prompted in the output, run the printed statements in the Dev SQL editor (project plukxnjnmowlnplpgsnm only).
// The test waits for each change by reading the person's `active` flag through the device (a public column).
const manual = process.env.S1_MANUAL === '1'
const deactivateSql = `update public.people set active = false where id = '${I.manual}';`
const reactivateSql = `update public.people set active = true where id = '${I.manual}';`
async function waitForActive(c: SupabaseClient, want: boolean, ms: number) {
  const until = Date.now() + ms
  for (;;) {
    const r = await c.from('people').select('active').eq('id', I.manual).single()
    if (r.data?.active === want) return
    if (Date.now() > until) throw new Error(`timed out waiting for active = ${want}`)
    await new Promise((res) => setTimeout(res, 2000))
  }
}

describe.skipIf(!manual)('semi-manual · deactivation during an open session (Dev SQL editor)', () => {
  it('outstanding grants stop working at once; the replay still answers; reactivation restores the dormant PIN only', { timeout: 420_000 }, async () => {
    const c = await device(CODE)
    await waitForActive(c, true, 5_000)                                                    // starts from an active person
    // a completed command, an outstanding one-shot grant and an open private context, all of the manual person
    const cmd = randomUUID()
    const done = await advance(c, cmd, await grantFor(c, I.manual, PIN.manual))
    expect(done.error).toBeNull()
    const pending = await grantFor(c, I.manual, PIN.manual)
    expect((await verify(c, I.manual, PIN.manual, 'private_session')).data?.ok).toBe(true)
    expect((await c.rpc('team_people')).error).toBeNull()

    console.log(`\n[S1 manual] Within 90 s, run in the Dev SQL editor:\n  ${deactivateSql}\n`)
    await waitForActive(c, false, 90_000)

    expect((await advance(c, randomUUID(), pending)).error?.message).toBe('VERIFICATION_REQUIRED')   // one-shot grant dead
    expect((await c.rpc('private_context_status')).data).toEqual({ active: false })                    // private context ended
    expect((await c.rpc('team_people')).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await advance(c, cmd, null)).data).toMatchObject({ advance_id: done.data.advance_id, replayed: true })
    expect((await verify(c, I.manual, PIN.manual)).data).toEqual({ ok: false, error: 'INVALID' })

    console.log(`\n[S1 manual] Now check the audit and the grants, then reactivate (Dev SQL editor):\n` +
      `  select action, detail from private.security_audit where subject = '${I.manual}' order by at desc limit 1;\n` +
      `  select scope, consumed_at is not null as consumed, revoked_at is not null as revoked from private.verification_grants\n` +
      `   where person_id = '${I.manual}' order by created_at desc limit 3;\n  ${reactivateSql}\n`)
    await waitForActive(c, true, 240_000)

    expect((await advance(c, randomUUID(), pending)).error?.message).toBe('VERIFICATION_REQUIRED')   // a revoked grant never returns
    const fresh = await grantFor(c, I.manual, PIN.manual)                                            // dormant PIN and permission restored
    expect((await advance(c, randomUUID(), fresh)).error).toBeNull()
  })
})
