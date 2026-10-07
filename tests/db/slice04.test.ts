// Slice 04 — professional situation: private-session verification (ADR-0009), B3/B4 visibility (07 §8) and the
// authoritative formulas (ADR-0004). Fixed synthetic values from supabase/seeds/05_slice04.sql (Test A, Setembro Teste).
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { A, B, device } from './env'

const id = (s: string) => `00000000-0000-4000-8000-00000000${s}`
const SELF = A.person                       // a201, PIN 111111 — standing 40% (60% from 1 Oct)
const MANAGER = id('a205')                  // team.finance.read, PIN 666666
const PENDING = id('a206')                  // contextual rule, PIN 777777
const EXCESS = id('a207')                   // standing 50%, PIN 888888
const CONF = id('a202')                     // movement.confirm, PIN 222222
const SEPT = '00000000-0000-4000-8000-0000000ca801', OCT = '00000000-0000-4000-8000-0000000ca802'
const B_SEPT = '00000000-0000-4000-8000-0000000cb801'
const A_CAT = id('a401')

let devA: SupabaseClient, devA2: SupabaseClient, devB: SupabaseClient

async function enter(c: SupabaseClient, person: string, secret: string) {
  const r = await c.rpc('verify_person', { p_person_id: person, p_secret: secret, p_scope: 'private_session' })
  expect(r.data?.ok).toBe(true)
  return r.data as { grant_id: string; scope: string; expires_in_s: number }
}
const situation = (c: SupabaseClient, person: string, period: string | null = SEPT) =>
  c.rpc('team_situation', { p_person_id: person, p_period_id: period })

beforeAll(async () => {
  devA = await device('TEST-ORG-A-2026')
  devA2 = await device('TEST-ORG-A-2026')
  devB = await device('TEST-ORG-B-2026')
})

describe('private context', () => {
  it('denies every situation read without a private-session verification', async () => {
    const fresh = await device('TEST-ORG-A-2026')
    expect((await situation(fresh, SELF)).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await fresh.rpc('team_history', { p_person_id: SELF, p_period_id: SEPT })).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await fresh.rpc('team_periods', { p_person_id: SELF })).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await fresh.rpc('team_people')).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await fresh.rpc('private_context_status')).data).toEqual({ active: false })
  })
  it('a one-shot confirmation grant never opens the private context', async () => {
    const fresh = await device('TEST-ORG-A-2026')
    expect((await fresh.rpc('verify_person', { p_person_id: CONF, p_secret: '222222' })).data.scope).toBe('one_shot')
    expect((await situation(fresh, CONF)).error?.message).toBe('VERIFICATION_REQUIRED')
  })
  it('a wrong secret or an unknown scope opens nothing', async () => {
    const fresh = await device('TEST-ORG-A-2026')
    expect((await fresh.rpc('verify_person', { p_person_id: PENDING, p_secret: '000000', p_scope: 'private_session' })).data).toEqual({ ok: false, error: 'INVALID' })
    expect((await fresh.rpc('verify_person', { p_person_id: PENDING, p_secret: '777777', p_scope: 'admin' })).data).toEqual({ ok: false, error: 'VALIDATION_FAILED' })
    expect((await situation(fresh, PENDING)).error?.message).toBe('VERIFICATION_REQUIRED')
  })
  it('is short-lived, bound to the device session and ends on explicit exit', async () => {
    const g = await enter(devA, SELF, '111111')
    expect(g.scope).toBe('private_session')
    expect(g.expires_in_s).toBeLessThanOrEqual(300)
    expect((await situation(devA, SELF)).error).toBeNull()
    expect((await situation(devA2, SELF)).error?.message).toBe('VERIFICATION_REQUIRED')     // not inherited by another device
    expect((await devA.rpc('end_private_context')).data.ok).toBe(true)
    expect((await situation(devA, SELF)).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await devA.rpc('private_context_status')).data).toEqual({ active: false })
  })
  it('a new private verification replaces the previous holder', async () => {
    await enter(devA, MANAGER, '666666')
    await enter(devA, SELF, '111111')
    const s = (await devA.rpc('private_context_status')).data
    expect([s.person_id, s.view]).toEqual([SELF, 'self'])
    expect((await situation(devA, EXCESS)).error?.message).toBe('NOT_AUTHORIZED')
  })
  it('a private-session grant cannot authorize a sensitive command', async () => {
    const g = await enter(devA, CONF, '222222')
    const r = await devA.rpc('record_expense', { p_command_id: randomUUID(), p_grant_id: g.grant_id, p_category_id: A_CAT,
      p_amount_minor: 100000, p_payments: [{ method_id: A.cash, amount_minor: 100000 }] })
    expect(r.error?.message).toBe('VERIFICATION_REQUIRED')
  })
})

describe('visibility (B3 own / B4 team finance)', () => {
  it('a professional reads only their own situation, without attributions', async () => {
    await enter(devA, SELF, '111111')
    const r = await situation(devA, SELF)
    expect(r.error).toBeNull()
    expect(r.data.view).toBe('self')
    expect(r.data.rule.set_by).toBeNull()
    const h = await devA.rpc('team_history', { p_person_id: SELF, p_period_id: SEPT })
    expect(h.data.rows.every((x: { confirmed_by: string | null }) => x.confirmed_by === null)).toBe(true)
    for (const other of [EXCESS, PENDING, MANAGER]) expect((await situation(devA, other)).error?.message).toBe('NOT_AUTHORIZED')
    expect((await devA.rpc('team_people')).error?.message).toBe('NOT_AUTHORIZED')
  })
  it('a team-finance holder reads anyone in the organization, with attributions', async () => {
    await enter(devA, MANAGER, '666666')
    const r = await situation(devA, EXCESS)
    expect([r.data.view, r.data.rule.set_by]).toEqual(['manager', 'Gestor Teste A'])
    const h = await devA.rpc('team_history', { p_person_id: EXCESS, p_period_id: SEPT, p_kind: 'advance' })
    expect(h.data.rows[0].confirmed_by).toBe('Confirmador Teste A')
    const people = (await devA.rpc('team_people')).data as { id: string }[]
    expect(people.map((p) => p.id)).toEqual(expect.arrayContaining([SELF, PENDING, EXCESS]))
    expect(people.some((p) => p.id === B.person)).toBe(false)
  })
  it('denies cross-tenant people and periods', async () => {
    await enter(devA, MANAGER, '666666')
    expect((await situation(devA, B.person)).error?.message).toBe('NOT_AUTHORIZED')
    expect((await situation(devA, SELF, B_SEPT)).error?.message).toBe('CROSS_TENANT_REFERENCE')
    expect((await devA.rpc('team_periods', { p_person_id: B.person })).error?.message).toBe('NOT_AUTHORIZED')
    await enter(devB, id('b202'), '444444')
    expect((await situation(devB, EXCESS, null)).error?.message).toBe('NOT_AUTHORIZED')
  })
  it('denies direct table access to periods, payments, rule versions and grants', async () => {
    await enter(devA, MANAGER, '666666')
    for (const t of ['periods', 'payments', 'rule_versions']) {
      const r = await devA.from(t).select('*').limit(1)
      expect(r.error?.code, t).toBe('42501')
    }
    expect((await devA.from('payments').insert({ amount_minor: 1 })).error?.code).toBe('42501')
    expect((await devA.from('rule_versions').update({ percent: 100 }).eq('person_id', SELF)).error?.code).toBe('42501')
  })
})

describe('authoritative calculation', () => {
  beforeAll(async () => { await enter(devA, MANAGER, '666666') })

  it('determinate rule: earned = rule × production; advances and payments reduce what remains', async () => {
    const d = (await situation(devA, SELF)).data
    expect(d.production).toEqual({ count: 3, total_minor: 3000000 })
    expect([d.rule.kind, Number(d.rule.percent)]).toEqual(['standing', 40])
    expect(d.earned_minor).toBe(1200000)
    expect(d.advances).toEqual({ count: 1, total_minor: 200000 })
    expect([d.payments.count, d.payments.total_minor]).toEqual([1, 400000])
    expect([d.difference_minor, d.remaining_minor, d.excess_minor]).toEqual([600000, 600000, 0])
  })
  it('contributions are reported apart and never enter the calculation', async () => {
    const d = (await situation(devA, SELF)).data
    expect(d.contributions).toEqual({ count: 1, total_minor: 200000 })
    expect(d.remaining_minor).toBe(d.earned_minor - d.advances.total_minor - d.payments.total_minor)
  })
  it('remaining clamps at zero and excess is returned separately, never as a negative payable', async () => {
    const d = (await situation(devA, EXCESS)).data
    expect(d.earned_minor).toBe(1000000)
    expect([d.difference_minor, d.remaining_minor, d.excess_minor]).toEqual([-300000, 0, 300000])
  })
  it('pending rule: no earned, remaining or excess; production and advances still shown', async () => {
    const d = (await situation(devA, PENDING)).data
    expect(d.rule.kind).toBe('contextual')
    expect([d.earned_minor, d.remaining_minor, d.excess_minor, d.difference_minor]).toEqual([null, null, null, null])
    expect(d.production.total_minor).toBe(1500000)
    expect(d.advances.total_minor).toBe(300000)
  })
  it('applies the standing rule version in force for the period', async () => {
    expect(Number((await situation(devA, SELF, OCT)).data.rule.percent)).toBe(60)
  })
  it('history lists exactly the records behind each row', async () => {
    const all = (await devA.rpc('team_history', { p_person_id: SELF, p_period_id: SEPT })).data
    expect(all.total_count).toBe(6)                            // 3 services, 1 advance, 1 payment, 1 contribution
    const kinds = (k: string) => devA.rpc('team_history', { p_person_id: SELF, p_period_id: SEPT, p_kind: k })
    const svc = (await kinds('service')).data.rows as { amount_minor: number }[]
    expect(svc.reduce((s, r) => s + r.amount_minor, 0)).toBe(3000000)
    expect((await kinds('payment')).data.rows[0].amount_minor).toBe(400000)
    expect((await kinds('contribution')).data.rows[0].purchase).toMatchObject({ total_minor: 500000, salon_minor: 300000 })
    expect((await kinds('bogus')).error?.message).toBe('VALIDATION_FAILED')
  })
  it('period list carries state and recorded payment totals', async () => {
    const ps = (await devA.rpc('team_periods', { p_person_id: SELF })).data as { id: string; state: string; payments_total_minor: number }[]
    expect(ps.find((p) => p.id === SEPT)).toMatchObject({ state: 'em_pagamento', payments_total_minor: 400000 })
    expect(ps.find((p) => p.id === OCT)?.state).toBe('aberto')
  })
})
