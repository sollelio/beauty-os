// Slice 06 — Fecho do período: review revision (ADR-0005), shared calculation (ADR-0004), approval outputs and
// close statements (ADR-0007), commands with exact grants and idempotency (ADR-0006, ADR-0009), reserve (D1).
// Fixed synthetic "Ciclo Teste" periods from supabase/seeds/07_slice06.sql; each run claims fresh ones.
// Per period: a201 standing 40% · 3 × 10.000, adv 2.000 → earned 12.000, payable 10.000
//             a207 standing 50% · 2 × 10.000, adv 12.000 → earned 10.000, payable 0, excess 2.000
//             a206 contextual  · 15.000, adv 3.000 → pending
//             expense 5.000 · purchase 3.000 (salon 2.000 + a201 1.000)
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { A, device } from './env'

const id = (s: string) => `00000000-0000-4000-8000-00000000${s}`
const K = (kz: number) => kz * 100
const P201 = A.person, P206 = id('a206'), P207 = id('a207'), MANAGER = id('a205')
const CONF = id('a202'), CONF2 = id('a204')                     // period.decide · payment.confirm · period.close
const B_SEPT = '00000000-0000-4000-8000-0000000cb801'
const OCT = '00000000-0000-4000-8000-0000000ca802'              // Outubro Teste (contains "today" in Oct 2026)

let dev: SupabaseClient, dev2: SupabaseClient
type Row = Record<string, any>                                  // eslint-disable-line @typescript-eslint/no-explicit-any

async function grant(c = dev, person = CONF, pin = '222222') {
  const r = await c.rpc('verify_person', { p_person_id: person, p_secret: pin })
  expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
  return r.data.grant_id as string
}
async function enterPrivate(c: SupabaseClient, person = MANAGER, pin = '666666') {
  expect((await c.rpc('verify_person', { p_person_id: person, p_secret: pin, p_scope: 'private_session' })).data?.ok).toBe(true)
}
const fecho = async (period: string, c = dev): Promise<Row> => {
  const r = await c.rpc('fecho_period', { p_period_id: period })
  expect(r.error, r.error?.message).toBeNull()
  return r.data
}
const used = new Set<string>()
async function freshPeriod(): Promise<string> {
  const all = (await dev.rpc('fecho_periods')).data as Row[]
  for (const p of all.filter((x) => x.label.startsWith('Ciclo Teste') && x.state === 'aberto').reverse()) {
    if (used.has(p.id)) continue
    const f = await fecho(p.id)
    const untouched = f.position.pending.length === 1 && f.position.owners_decision === null && f.position.reserve_allocated_minor === 0
    used.add(p.id)
    if (untouched) return p.id
  }
  throw new Error('No untouched Ciclo Teste period left — add a seed file with more test periods')
}
const call = (c: SupabaseClient, fn: string, args: Row) => c.rpc(fn, args)
const decide = async (period: string, person: string, percent: number, g?: string) =>
  call(dev, 'decide_period_rule', { p_command_id: randomUUID(), p_grant_id: g ?? await grant(), p_period_id: period, p_person_id: person, p_percent: percent })
const approve = async (period: string, revision: number, g?: string, cmd = randomUUID()) =>
  call(dev, 'approve_period', { p_command_id: cmd, p_grant_id: g ?? await grant(), p_period_id: period, p_review_revision: revision })
const pay = async (period: string, person: string, amount: number, cmd = randomUUID(), g?: string) =>
  call(dev, 'confirm_payment', { p_command_id: cmd, p_grant_id: g ?? await grant(), p_period_id: period, p_person_id: person, p_amount_minor: amount, p_payment_method_id: A.cash })
const close = async (period: string, revision: number) =>
  call(dev, 'close_period', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: period, p_review_revision: revision })
const person = (f: Row, pid: string) => f.position.people.find((x: Row) => x.person_id === pid)

beforeAll(async () => {
  dev = await device('TEST-ORG-A-2026')
  dev2 = await device('TEST-ORG-A-2026')
  await enterPrivate(dev)
})

describe('access', () => {
  it('Fecho reads need a private context of a team-finance holder', async () => {
    const fresh = await device('TEST-ORG-A-2026')
    expect((await fresh.rpc('fecho_period', { p_period_id: OCT })).error?.message).toBe('VERIFICATION_REQUIRED')
    await enterPrivate(fresh, P201, '111111')                                     // own view only (B3)
    for (const fn of ['fecho_period', 'fecho_money', 'fecho_history']) expect((await fresh.rpc(fn, { p_period_id: OCT })).error?.message, fn).toBe('NOT_AUTHORIZED')
  })
  it('no direct table access to Fecho records', async () => {
    for (const t of ['period_rule_decisions', 'owners_decisions', 'reserve_allocations', 'reserve_uses', 'period_approvals', 'period_approval_lines',
      'period_approval_annulments', 'period_transitions', 'period_close_statements', 'payments', 'periods']) {
      expect((await dev.from(t).select('*').limit(1)).error?.code, t).toBe('42501')
    }
    expect((await dev.from('period_approvals').insert({})).error?.code).toBe('42501')
    expect((await dev.from('periods').update({ state: 'fechado' }).eq('id', OCT)).error?.code).toBe('42501')
  })
  it('cross-tenant periods and people are rejected', async () => {
    expect((await dev.rpc('fecho_period', { p_period_id: B_SEPT })).error?.message).toBe('CROSS_TENANT_REFERENCE')
    expect((await approve(B_SEPT, 0)).error?.message).toBe('CROSS_TENANT_REFERENCE')
    const p = await freshPeriod()
    expect((await decide(p, id('b201'), 40)).error?.message).toBe('CROSS_TENANT_REFERENCE')
    expect((await call(dev, 'use_reserve', { p_command_id: randomUUID(), p_grant_id: await grant(), p_expense_id: randomUUID(), p_purchase_id: null, p_amount_minor: 100 })).error?.message).toBe('CROSS_TENANT_REFERENCE')
  })
})

describe('position and pending rules', () => {
  it('computes the period from records; a pending rule gives "—", never 0', async () => {
    const f = await fecho(await freshPeriod())
    expect(f.position.production.total_minor).toBe(K(65000))
    expect(f.position.team_earned_minor).toBe(K(22000))
    expect(f.position.pending.map((x: Row) => x.person_id)).toEqual([P206])
    expect([person(f, P206).earned_minor, person(f, P206).remaining_minor, person(f, P206).excess_minor]).toEqual([null, null, null])
    expect(f.position.livre_minor).toBeNull()
    expect(f.position.sobra_minor).toBe(K(65000 - 22000 - 5000 - 2000 - 2000))          // 34.000, excess subtracted as its own term
    expect(f.position.purchases).toMatchObject({ total_minor: K(3000), contributions_minor: K(1000), salon_minor: K(2000) })
    expect(f.position.payable_minor).toBe(K(10000))
    expect(f.exceptions.map((e: Row) => e.kind)).toEqual(['rule_pending', 'above_earned'])
    expect(f.readiness.can_approve).toBe(false)
  })
  it('pending rule blocks approval', async () => {
    const p = await freshPeriod()
    expect((await approve(p, (await fecho(p)).review_revision)).error?.message).toBe('RULE_PENDING')
  })
  it('rule preview is read-only and uses the same calculation', async () => {
    const p = await freshPeriod()
    const before = await fecho(p)
    const r = (await dev.rpc('fecho_rule_preview', { p_period_id: p, p_person_id: P206, p_percent: 40 })).data
    expect([r.person.earned_minor, r.person.remaining_minor]).toEqual([K(6000), K(3000)])
    expect([r.base_minor, r.after.sobra_minor, r.after.livre_minor]).toEqual([K(34000), K(28000), K(28000)])
    expect((await fecho(p)).review_revision).toBe(before.review_revision)
  })
})

describe('contextual rule decisions', () => {
  it('needs the exact grant of a period.decide holder', async () => {
    const p = await freshPeriod()
    expect((await call(dev, 'decide_period_rule', { p_command_id: randomUUID(), p_grant_id: null, p_period_id: p, p_person_id: P206, p_percent: 40 })).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await decide(p, P206, 40, await grant(dev, P201, '111111'))).error?.message).toBe('NOT_AUTHORIZED')
    expect((await decide(p, P206, 40, await grant(dev2))).error?.message).toBe('VERIFICATION_REQUIRED')     // other device
    const mine = await grant(dev, CONF)
    await grant(dev, CONF2, '555555')                                                                    // a later verification supersedes it
    expect((await decide(p, P206, 40, mine)).error?.message).toBe('VERIFICATION_REQUIRED')
  })
  it('applies to contextual rules only, 0–100; a change is a new record; Slice 04 sees the decided value', async () => {
    const p = await freshPeriod()
    expect((await decide(p, P201, 40)).error?.message).toBe('VALIDATION_FAILED')                         // standing rule
    expect((await decide(p, P206, 101)).error?.message).toBe('VALIDATION_FAILED')
    const r0 = (await fecho(p)).review_revision
    const d1 = await decide(p, P206, 40)
    expect([d1.error, d1.data.previous_percent, d1.data.review_revision]).toEqual([null, null, r0 + 1])
    const d2 = await decide(p, P206, 50)
    expect(Number(d2.data.previous_percent)).toBe(40)
    const f = await fecho(p)
    expect([person(f, P206).earned_minor, f.position.livre_minor]).toEqual([K(7500), K(34000 - 7500)])
    expect(f.exceptions.map((e: Row) => e.kind)).toEqual(['above_earned', 'distribution_undecided'])
    const s = (await dev.rpc('team_situation', { p_person_id: P206, p_period_id: p })).data
    expect([s.rule.kind, Number(s.rule.percent), s.earned_minor, s.remaining_minor]).toEqual(['contextual', 50, K(7500), K(4500)])
    const h = (await dev.rpc('fecho_history', { p_period_id: p })).data as Row[]
    expect(h.filter((x) => x.kind === 'rule').map((x) => [Number(x.percent), x.previous_percent && Number(x.previous_percent)])).toEqual([[50, 40], [40, null]])
  })
})

describe('review revision', () => {
  it('earlier-slice records change the revision of the period they fall in', async () => {
    const f0 = await fecho(OCT)
    if (!f0.period.is_current) return                                              // only meaningful while Outubro Teste is current
    const svc = await dev.rpc('record_service', { p_command_id: randomUUID(), p_person_id: P201, p_service_id: A.service, p_value_minor: 100000,
      p_payments: [{ method_id: A.cash, amount_minor: 100000 }] })
    expect(svc.error).toBeNull()
    const f1 = await fecho(OCT)
    expect(f1.review_revision).toBe(f0.review_revision + 1)
    expect(f1.position.production.total_minor).toBe(f0.position.production.total_minor + 100000)
  })
  it('approval of a changed review is STALE_REVIEW and commits nothing', async () => {
    const p = await freshPeriod()
    await decide(p, P206, 40)
    const reviewed = (await fecho(p)).review_revision
    await call(dev, 'record_owners_decision', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p, p_kind: 'none' })
    expect((await approve(p, reviewed)).error?.message).toBe('STALE_REVIEW')
    const f = await fecho(p)
    expect([f.period.state, f.approval]).toEqual(['aberto', null])
  })
})

describe('approval → payments → close', () => {
  let p: string
  beforeAll(async () => {
    p = await freshPeriod()
    await decide(p, P206, 50)                                                      // a206 earned 7.500 − adv 3.000 → 4.500
  })

  it('approves under the reviewed revision with immutable per-person outputs', async () => {
    const f = await fecho(p)
    const a = await approve(p, f.review_revision)
    expect(a.error).toBeNull()
    expect(a.data.total_minor).toBe(K(14500))
    const g = await fecho(p)
    expect(g.period.state).toBe('pronto_para_pagamento')
    expect(g.approval.lines.map((l: Row) => [l.person_id, l.approved_minor, l.status])).toEqual(expect.arrayContaining([
      [P201, K(10000), 'por_pagar'], [P206, K(4500), 'por_pagar'], [P207, 0, 'nada_a_pagar']]))
    expect(g.approval.cases).toEqual([expect.objectContaining({ person_id: P207, excess_minor: K(2000) })])
    expect(g.approval.review_revision).toBe(f.review_revision)
    expect(g.exceptions.map((e: Row) => e.kind)).toEqual(['distribution_undecided', 'payment_pending', 'payment_pending'])
    expect((await decide(p, P206, 60)).error?.message).toBe('PERIOD_STATE_INVALID')    // frozen after approval
  })
  it('annuls only before any payment, back to Aberto; then re-approves', async () => {
    const f = await fecho(p)
    const n = await call(dev, 'annul_approval', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p, p_review_revision: f.review_revision })
    expect(n.error).toBeNull()
    expect((await fecho(p)).period.state).toBe('aberto')
    expect((await approve(p, (await fecho(p)).review_revision)).error).toBeNull()
  })
  it('payments are capped by the approved remainder, idempotent, and start Em pagamento', async () => {
    expect((await pay(p, P201, K(10001))).error?.message).toBe('PAYMENT_EXCEEDS_APPROVED')
    expect((await pay(p, MANAGER, K(1))).error?.message).toBe('PAYMENT_EXCEEDS_APPROVED')            // nothing approved for them
    expect((await pay(p, P201, K(1), randomUUID(), await grant(dev, P201, '111111'))).error?.message).toBe('NOT_AUTHORIZED')
    const cmd = randomUUID()
    const first = await pay(p, P201, K(4000), cmd)
    expect([first.error, first.data.outstanding_minor]).toEqual([null, K(6000)])
    const replay = await pay(p, P201, K(4000), cmd)
    expect([replay.data.replayed, replay.data.payment_id]).toEqual([true, first.data.payment_id])
    expect((await pay(p, P201, K(3000), cmd)).error?.message).toBe('IDEMPOTENCY_CONFLICT')
    const f = await fecho(p)
    expect(f.period.state).toBe('em_pagamento')
    expect(f.approval.lines.find((l: Row) => l.person_id === P201)).toMatchObject({ status: 'parcial', paid_minor: K(4000), outstanding_minor: K(6000) })
    const n = await call(dev, 'annul_approval', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p, p_review_revision: f.review_revision })
    expect(n.error?.message).toBe('PERIOD_STATE_INVALID')                         // a payment exists
  })
  it('concurrent duplicates of one payment intent record one payment', async () => {
    const cmd = randomUUID()
    const g = await grant()
    const results = await Promise.all(Array.from({ length: 5 }, () => pay(p, P206, K(1000), cmd, g)))
    expect(results.every((r) => r.error === null)).toBe(true)
    expect(new Set(results.map((r) => r.data.payment_id)).size).toBe(1)
    expect((await fecho(p)).approval.lines.find((l: Row) => l.person_id === P206).paid_minor).toBe(K(1000))
  })
  it('cannot close while approved amounts are unpaid; stale close is rejected; then closes', async () => {
    expect((await close(p, (await fecho(p)).review_revision)).error?.message).toBe('UNPAID_APPROVED_AMOUNTS')
    await pay(p, P201, K(6000))
    await pay(p, P206, K(3500))
    const stale = (await fecho(p)).review_revision - 1
    expect((await close(p, stale)).error?.message).toBe('STALE_REVIEW')
    const before = await fecho(p)
    const c = await close(p, before.review_revision)
    expect(c.error).toBeNull()
    const after = await fecho(p)
    expect([after.period.state, after.source]).toEqual(['fechado', 'close_statement'])
    expect(after.position).toEqual(before.position)                              // the statement is what was shown
    expect(after.closed.calculation_version).toBe(before.calculation_version)
    expect(after.exceptions).toEqual([])
  })
  it('a closed period rejects every mutation', async () => {
    const r = (await fecho(p)).review_revision
    expect((await decide(p, P206, 10)).error?.message).toBe('PERIOD_CLOSED')
    expect((await approve(p, r)).error?.message).toBe('PERIOD_CLOSED')
    expect((await pay(p, P201, 1)).error?.message).toBe('PERIOD_CLOSED')
    expect((await close(p, r)).error?.message).toBe('PERIOD_CLOSED')
    expect((await call(dev, 'record_owners_decision', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p, p_kind: 'none' })).error?.message).toBe('PERIOD_CLOSED')
    expect((await call(dev, 'allocate_reserve', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p, p_amount_minor: 100 })).error?.message).toBe('PERIOD_CLOSED')
    const h = (await dev.rpc('fecho_history', { p_period_id: p })).data as Row[]
    expect(h[0].kind).toBe('close')
    expect(h.filter((x) => x.kind === 'payment')).toHaveLength(4)
    expect(h.filter((x) => x.kind === 'approval')).toHaveLength(2)
    expect(h.filter((x) => x.kind === 'annulment')).toHaveLength(1)
  })
})

describe('owners decision and reserve (D1, D3)', () => {
  it('owners decision: Não distribuído = livre − distribuição, signed; a later decision replaces it', async () => {
    const p = await freshPeriod()
    await decide(p, P206, 40)                                                      // livre 28.000
    await call(dev, 'record_owners_decision', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p, p_kind: 'amount', p_amount_minor: K(30000) })
    let f = await fecho(p)
    expect([f.position.distribution_minor, f.position.undistributed_minor]).toEqual([K(30000), K(-2000)])
    expect(f.exceptions.map((e: Row) => e.kind)).toContain('distribution_above_free')
    await call(dev, 'record_owners_decision', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p, p_kind: 'none' })
    f = await fecho(p)
    expect([f.position.distribution_minor, f.position.undistributed_minor]).toEqual([0, K(28000)])
    expect((await call(dev, 'record_owners_decision', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p, p_kind: 'amount', p_amount_minor: 0 })).error?.message).toBe('VALIDATION_FAILED')
  })
  it('reserve: allocation lowers livre and raises the balance; a use is capped by the balance and by the record; it adds back', async () => {
    const p = await freshPeriod()
    await decide(p, P206, 40)
    const money0 = (await dev.rpc('fecho_money', { p_period_id: p })).data
    const al = await call(dev, 'allocate_reserve', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p, p_amount_minor: K(6000), p_note: 'imprevistos' })
    expect(al.error).toBeNull()
    expect(al.data.balance_minor).toBe(money0.reserve.balance_minor + K(6000))
    expect((await fecho(p)).position.livre_minor).toBe(K(28000 - 6000))
    const money = (await dev.rpc('fecho_money', { p_period_id: p })).data
    const expense = money.expenses[0].id, purchase = money.purchases[0].id
    const use = async (e: string | null, pu: string | null, amount: number) =>
      call(dev, 'use_reserve', { p_command_id: randomUUID(), p_grant_id: await grant(), p_expense_id: e, p_purchase_id: pu, p_amount_minor: amount })
    expect((await use(expense, null, money.reserve.balance_minor + 1)).error?.message).toBe('RESERVE_INSUFFICIENT')
    expect((await use(expense, null, K(5000) + 1)).error?.message).toBe('RESERVE_EXCEEDS_RECORD')
    expect((await use(null, purchase, K(2000) + 1)).error?.message).toBe('RESERVE_EXCEEDS_RECORD')   // salon part only, never contributors' money
    expect((await use(expense, null, K(3000))).error).toBeNull()
    expect((await use(expense, null, K(2001))).error?.message).toBe('RESERVE_EXCEEDS_RECORD')          // 2.000 of that expense left
    const f = await fecho(p)
    expect([f.position.reserve_used_minor, f.position.livre_minor]).toEqual([K(3000), K(28000 - 6000 + 3000)])
    expect(f.position.expenses.total_minor).toBe(K(5000))                         // the expense still counts once
    const m2 = (await dev.rpc('fecho_money', { p_period_id: p })).data
    expect(m2.reserve.balance_minor).toBe(money.reserve.balance_minor - K(3000))
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Decisions closed 2026-10-07: reopen (B8) and no new records in an approved period.
const C = { cash: id('c101'), pro: id('c201'), mgr: id('c202'), svc: id('c301'), cat: id('c401'), origin: id('c501'), product: id('c601') }

describe('reopen', () => {
  let p: string
  const reopen = async (period: string, revision: number, reason: string | null, cmd = randomUUID(), g?: string) =>
    call(dev, 'reopen_period', { p_command_id: cmd, p_grant_id: g ?? await grant(), p_period_id: period, p_review_revision: revision, p_reason: reason })
  beforeAll(async () => {
    p = await freshPeriod()
    await decide(p, P206, 50)
    await approve(p, (await fecho(p)).review_revision)
    await pay(p, P201, K(10000)); await pay(p, P206, K(4500))
    expect((await close(p, (await fecho(p)).review_revision)).error).toBeNull()
  })

  it('needs a reason, the reopen permission, this device\'s exact grant and the reviewed revision', async () => {
    const r = (await fecho(p)).review_revision
    expect((await reopen(p, r, '  ')).error?.message).toBe('VALIDATION_FAILED')
    expect((await reopen(p, r, 'motivo', randomUUID(), await grant(dev, CONF2, '555555'))).error?.message).toBe('NOT_AUTHORIZED')   // period.decide/close, but not period.reopen
    expect((await reopen(p, r, 'motivo', randomUUID(), await grant(dev2))).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await reopen(p, r - 1, 'motivo')).error?.message).toBe('STALE_REVIEW')
    expect((await fecho(p)).period.state).toBe('fechado')
  })
  it('with confirmed payments → Em pagamento; replay is idempotent; everything recorded stays', async () => {
    const before = await fecho(p)
    const cmd = randomUUID()
    const r = await reopen(p, before.review_revision, 'Distribuição registada com valor errado', cmd)
    expect([r.error, r.data.state]).toEqual([null, 'em_pagamento'])
    expect((await reopen(p, before.review_revision, 'Distribuição registada com valor errado', cmd)).data.replayed).toBe(true)
    expect((await reopen(p, before.review_revision, 'Outro motivo', cmd)).error?.message).toBe('IDEMPOTENCY_CONFLICT')
    const f = await fecho(p)
    expect([f.period.state, f.source, f.close_statements_count]).toEqual(['em_pagamento', 'live', 1])
    expect(f.reopened).toMatchObject({ reason: 'Distribuição registada com valor errado', by: 'Confirmador Teste A', to_state: 'em_pagamento' })
    expect(f.approval.id).toBe(before.approval.id)
    expect(f.approval.lines).toEqual(before.approval.lines)
    expect(f.position.livre_minor).toBe(before.position.livre_minor)
    const h = (await dev.rpc('fecho_history', { p_period_id: p })).data as Row[]
    expect(h[0]).toMatchObject({ kind: 'reopen', reason: 'Distribuição registada com valor errado' })
    expect(h.filter((x) => x.kind === 'close')).toHaveLength(1)
    expect(h.filter((x) => x.kind === 'payment')).toHaveLength(2)
  })
  it('reopened: owners decision can be revised; rules and approval stay frozen; closing again adds a statement', async () => {
    expect((await call(dev, 'record_owners_decision', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p, p_kind: 'amount', p_amount_minor: K(1000) })).error).toBeNull()
    expect((await decide(p, P206, 10)).error?.message).toBe('PERIOD_STATE_INVALID')
    expect((await call(dev, 'annul_approval', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p, p_review_revision: (await fecho(p)).review_revision })).error?.message).toBe('PERIOD_STATE_INVALID')
    expect((await close(p, (await fecho(p)).review_revision)).error).toBeNull()
    const f = await fecho(p)
    expect([f.period.state, f.source, f.close_statements_count, f.position.distribution_minor]).toEqual(['fechado', 'close_statement', 2, K(1000)])
    expect(((await dev.rpc('fecho_history', { p_period_id: p })).data as Row[]).filter((x) => x.kind === 'close')).toHaveLength(2)
  })
  it('without confirmed payments → Pronto para pagamento (and the approval can then be annulled)', async () => {
    const devC = await device('TEST-ORG-C-2026')
    await enterPrivate(devC, C.mgr, '343434')
    const g = () => grant(devC, C.mgr, '343434')
    const all = (await devC.rpc('fecho_periods')).data as Row[]
    let q: string | undefined
    for (const x of all.filter((y) => y.label.startsWith('Reabrir Teste') && y.state === 'aberto').reverse()) { q = x.id; break }
    expect(q, 'no Reabrir Teste period left — add a seed file').toBeDefined()
    const fc = async () => (await devC.rpc('fecho_period', { p_period_id: q })).data as Row
    expect((await call(devC, 'approve_period', { p_command_id: randomUUID(), p_grant_id: await g(), p_period_id: q, p_review_revision: (await fc()).review_revision })).data.total_minor).toBe(0)
    expect((await call(devC, 'close_period', { p_command_id: randomUUID(), p_grant_id: await g(), p_period_id: q, p_review_revision: (await fc()).review_revision })).error).toBeNull()
    const r = await call(devC, 'reopen_period', { p_command_id: randomUUID(), p_grant_id: await g(), p_period_id: q, p_review_revision: (await fc()).review_revision, p_reason: 'Rever decisão' })
    expect(r.data.state).toBe('pronto_para_pagamento')
    const f = await fc()
    expect([f.period.state, f.readiness.can_annul, f.close_statements_count]).toEqual(['pronto_para_pagamento', true, 1])
  })
})

describe('no new records in an approved period', () => {
  let devC: SupabaseClient
  const g = (c = devC) => grant(c, C.mgr, '343434')
  const service = (cmd = randomUUID()) => devC.rpc('record_service', { p_command_id: cmd, p_person_id: C.pro, p_service_id: C.svc, p_value_minor: K(10000),
    p_payments: [{ method_id: C.cash, amount_minor: K(10000) }] })
  const advance = async () => devC.rpc('record_advance', { p_command_id: randomUUID(), p_grant_id: await g(), p_person_id: C.pro, p_amount_minor: K(100), p_payment_method_id: C.cash })
  const expense = async () => devC.rpc('record_expense', { p_command_id: randomUUID(), p_grant_id: await g(), p_category_id: C.cat, p_amount_minor: K(100),
    p_payments: [{ method_id: C.cash, amount_minor: K(100) }] })
  const purchase = async () => devC.rpc('record_purchase', { p_command_id: randomUUID(), p_grant_id: await g(), p_lines: [{ product_id: C.product, quantity: 1, line_cost_minor: K(100) }],
    p_salon_amount_minor: K(100), p_contributions: [], p_origin_id: C.origin })
  const today = async () => (await devC.rpc('fecho_period', { p_period_id: null })).data as Row
  const cmd = (fn: string, args: Row) => devC.rpc(fn, { p_command_id: randomUUID(), ...args })

  beforeAll(async () => {
    devC = await device('TEST-ORG-C-2026')
    await enterPrivate(devC, C.mgr, '343434')
  })

  it('approved without payments: capture rejected; annul, then capture succeeds', async () => {
    const f0 = await today()
    expect(f0.period.is_current).toBe(true)
    if (f0.period.state !== 'aberto') return                                        // already consumed today: covered by the next test
    const committed = randomUUID()
    expect((await service(committed)).error).toBeNull()
    expect((await cmd('approve_period', { p_grant_id: await g(), p_period_id: f0.period.id, p_review_revision: (await today()).review_revision })).error).toBeNull()
    for (const r of [await service(), await advance(), await expense(), await purchase()]) expect(r.error?.message).toBe('PERIOD_APPROVED')
    expect((await service(committed)).data.replayed).toBe(true)                    // a committed record still replays
    const before = await today()
    expect(before.approval.lines[0].approved_minor).toBe(K(5000))                  // approved values unchanged by the rejected attempts
    expect((await cmd('annul_approval', { p_grant_id: await g(), p_period_id: f0.period.id, p_review_revision: before.review_revision })).error).toBeNull()
    expect((await service()).error).toBeNull()
    expect((await today()).position.payable_minor).toBe(K(10000))
    // approve again and confirm one payment: from here the inputs stay locked
    expect((await cmd('approve_period', { p_grant_id: await g(), p_period_id: f0.period.id, p_review_revision: (await today()).review_revision })).error).toBeNull()
    expect((await cmd('confirm_payment', { p_grant_id: await g(), p_period_id: f0.period.id, p_person_id: C.pro, p_amount_minor: K(1000), p_payment_method_id: C.cash })).error).toBeNull()
  })
  it('with payments: capture stays rejected and the approval cannot be annulled', async () => {
    const f = await today()
    expect(f.period.state).toBe('em_pagamento')
    for (const r of [await service(), await advance(), await expense(), await purchase()]) expect(r.error?.message).toBe('PERIOD_APPROVED')
    expect((await cmd('annul_approval', { p_grant_id: await g(), p_period_id: f.period.id, p_review_revision: f.review_revision })).error?.message).toBe('PERIOD_STATE_INVALID')
    expect((await today()).review_revision).toBe(f.review_revision)                // nothing changed
  })
})
