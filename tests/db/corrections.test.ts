// Pilot corrections: cancel (anular) a mistaken service, advance, expense or purchase while its period is Aberto.
// Nothing is deleted; active calculations exclude the original; the history keeps it with who, when and why.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { A, device } from './env'

type Row = Record<string, any>                                  // eslint-disable-line @typescript-eslint/no-explicit-any
const id = (s: string) => `00000000-0000-4000-8000-00000000${s}`
const K = (kz: number) => kz * 100
const CONF = id('a202'), CONF2 = id('a204'), MANAGER = id('a205')     // a202 holds records.correct; a204 does not
const OCT = '00000000-0000-4000-8000-0000000ca802'
let dev: SupabaseClient, dev2: SupabaseClient

async function grant(c = dev, person = CONF, pin = '222222') {
  const r = await c.rpc('verify_person', { p_person_id: person, p_secret: pin })
  expect(r.data?.ok).toBe(true)
  return r.data.grant_id as string
}
const cancel = async (kind: string, record: string, reason: string | null = 'Registado por engano', cmd = randomUUID(), g?: string, c = dev) =>
  c.rpc('cancel_record', { p_command_id: cmd, p_grant_id: g ?? await grant(c), p_kind: kind, p_record_id: record, p_reason: reason })
const fecho = async (p: string | null = OCT) => (await dev.rpc('fecho_period', { p_period_id: p })).data as Row
// Teste Fecho C's own approved period with one service of c201 (supabase/seeds/14_corrections_fixture.sql): fixed,
// so these tests do not depend on the day they run nor on slice06 having approved today's period first.
async function orgC() {
  const devC = await device('TEST-ORG-C-2026')
  expect((await devC.rpc('verify_person', { p_person_id: id('c202'), p_secret: '343434', p_scope: 'private_session' })).data.ok).toBe(true)
  const period = ((await devC.rpc('fecho_periods')).data as Row[]).find((x) => x.label === 'Correções C')!
  expect(period, 'Correções C (seed 14)').toBeDefined()
  const row = ((await devC.rpc('team_history', { p_person_id: id('c201'), p_period_id: period.id, p_kind: 'service' })).data as Row).rows[0]
  return { devC, period, record: row.record_id as string }
}
async function newService(value = K(1000)) {
  const r = await dev.rpc('record_service', { p_command_id: randomUUID(), p_person_id: A.person, p_service_id: A.service, p_value_minor: value,
    p_payments: [{ method_id: A.cash, amount_minor: value }] })
  expect(r.error).toBeNull()
  return r.data.record_id as string
}

beforeAll(async () => {
  dev = await device('TEST-ORG-A-2026')
  dev2 = await device('TEST-ORG-A-2026')
  expect((await dev.rpc('verify_person', { p_person_id: MANAGER, p_secret: '666666', p_scope: 'private_session' })).data.ok).toBe(true)
})

describe('authorization', () => {
  it('needs records.correct, this device\'s exact grant and a reason', async () => {
    const s = await newService()
    expect((await cancel('service', s, 'x', randomUUID(), await grant(dev, CONF2, '555555'))).error?.message).toBe('NOT_AUTHORIZED')
    expect((await cancel('service', s, 'x', randomUUID(), await grant(dev, A.person, '111111'))).error?.message).toBe('NOT_AUTHORIZED')
    expect((await cancel('service', s, 'x', randomUUID(), await grant(dev2))).error?.message).toBe('VERIFICATION_REQUIRED')
    const mine = await grant(dev)
    await grant(dev, CONF2, '555555')                                          // a later verification supersedes it
    expect((await cancel('service', s, 'x', randomUUID(), mine)).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await dev.rpc('cancel_record', { p_command_id: randomUUID(), p_grant_id: null, p_kind: 'service', p_record_id: s, p_reason: 'x' })).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await cancel('service', s, '   ')).error?.message).toBe('VALIDATION_FAILED')
    expect((await cancel('nonsense', s)).error?.message).toBe('VALIDATION_FAILED')
  })
  it('rejects other organizations\' records', async () => {
    expect((await cancel('service', randomUUID())).error?.message).toBe('CROSS_TENANT_REFERENCE')
    const { record } = await orgC()
    expect((await cancel('service', record)).error?.message).toBe('CROSS_TENANT_REFERENCE')
  })
})

describe('open period', () => {
  it('service: excluded from production, Hoje and the person; revision bumps; history keeps it', async () => {
    const f0 = await fecho()
    if (!f0.period.is_current) return
    const s = await newService(K(7777))
    const f1 = await fecho()
    const hoje1 = JSON.stringify((await dev.rpc('hoje_service_summary', {})).data)
    expect(hoje1).toContain(s)
    const r = await cancel('service', s, 'Valor errado')
    expect(r.error).toBeNull()
    const f2 = await fecho()
    expect(f2.position.production.total_minor).toBe(f1.position.production.total_minor - K(7777))
    expect(f2.review_revision).toBe(f1.review_revision + 1)
    expect(JSON.stringify((await dev.rpc('hoje_service_summary', {})).data)).not.toContain(s)
    const hist = ((await dev.rpc('team_history', { p_person_id: A.person, p_period_id: OCT, p_kind: 'service' })).data as Row).rows as Row[]
    expect(hist.some((x) => x.record_id === s)).toBe(false)
    const h = (await dev.rpc('fecho_history', { p_period_id: OCT })).data as Row[]
    expect(h.find((x) => x.kind === 'cancellation' && x.record_kind === 'service' && x.reason === 'Valor errado')).toMatchObject({ by: 'Confirmador Teste A', record: { amount_minor: K(7777) } })
    expect((await dev.rpc('record_summary', { p_kind: 'service', p_record_id: s })).data.cancelled).toMatchObject({ reason: 'Valor errado', by: 'Confirmador Teste A' })
  })
  it('advance, expense and purchase: each leaves the active figures', async () => {
    const f0 = await fecho()
    if (!f0.period.is_current) return
    const adv = (await dev.rpc('record_advance', { p_command_id: randomUUID(), p_grant_id: await grant(), p_person_id: A.person, p_amount_minor: K(333), p_payment_method_id: A.cash })).data.advance_id
    const exp = (await dev.rpc('record_expense', { p_command_id: randomUUID(), p_grant_id: await grant(), p_category_id: id('a401'), p_amount_minor: K(444),
      p_payments: [{ method_id: A.cash, amount_minor: K(444) }] })).data.expense_id
    const pur = (await dev.rpc('record_purchase', { p_command_id: randomUUID(), p_grant_id: await grant(), p_lines: [{ product_id: id('a601'), quantity: 1, line_cost_minor: K(555) }],
      p_salon_amount_minor: K(555), p_contributions: [], p_origin_id: id('a501') })).data.purchase_id
    const f1 = await fecho()
    const stock1 = ((await dev.rpc('stock_overview')).data as Row[]).find((p) => p.id === id('a601'))
    for (const [k, rid] of [['advance', adv], ['expense', exp], ['purchase', pur]]) expect((await cancel(k!, rid)).error, k).toBeNull()
    const f2 = await fecho()
    expect(f2.position.advances_minor).toBe(f1.position.advances_minor - K(333))
    expect(f2.position.expenses.total_minor).toBe(f1.position.expenses.total_minor - K(444))
    expect(f2.position.purchases.total_minor).toBe(f1.position.purchases.total_minor - K(555))
    expect(f2.review_revision).toBe(f1.review_revision + 3)
    const stock2 = ((await dev.rpc('stock_overview')).data as Row[]).find((p) => p.id === id('a601'))
    expect(stock2?.bought_today?.quantity ?? 0).toBe((stock1?.bought_today?.quantity ?? 0) - 1)
    const money = (await dev.rpc('fecho_money', { p_period_id: OCT })).data as Row
    expect(money.expenses.some((e: Row) => e.id === exp)).toBe(false)
    const kinds = ((await dev.rpc('fecho_history', { p_period_id: OCT })).data as Row[]).filter((x) => x.kind === 'cancellation').map((x) => x.record_kind)
    expect(kinds).toEqual(expect.arrayContaining(['advance', 'expense', 'purchase']))
  })
  it('replay is idempotent; another reason is a conflict; a second cancellation is refused', async () => {
    const s = await newService()
    const cmd = randomUUID()
    const first = await cancel('service', s, 'Duplicado', cmd)
    expect(first.error).toBeNull()
    const again = await cancel('service', s, 'Duplicado', cmd)
    expect([again.data.replayed, again.data.cancellation_id]).toEqual([true, first.data.cancellation_id])
    expect((await cancel('service', s, 'Outro motivo', cmd)).error?.message).toBe('IDEMPOTENCY_CONFLICT')
    expect((await cancel('service', s, 'Outra vez')).error?.message).toBe('RECORD_ALREADY_CANCELLED')
  })
  it('an expense already paid from the reserve cannot be cancelled', async () => {
    const all = (await dev.rpc('fecho_periods')).data as Row[]
    const p = all.find((x) => x.label.startsWith('Ciclo Teste') && x.state === 'aberto')!.id
    await dev.rpc('allocate_reserve', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p, p_amount_minor: K(100) })
    const exp = ((await dev.rpc('fecho_money', { p_period_id: p })).data as Row).expenses[0]
    if (exp.reserve_used_minor === 0) await dev.rpc('use_reserve', { p_command_id: randomUUID(), p_grant_id: await grant(), p_expense_id: exp.id, p_purchase_id: null, p_amount_minor: K(100) })
    expect((await cancel('expense', exp.id)).error?.message).toBe('RECORD_IN_USE')
  })
})

describe('not after approval', () => {
  it('refused in Pronto para pagamento, Em pagamento and Fechado', async () => {
    let all = (await dev.rpc('fecho_periods')).data as Row[]
    if (!all.some((x) => x.label.startsWith('Ciclo Teste') && x.state === 'pronto_para_pagamento')) {
      // approve one untouched test period (its contextual rule decided first)
      const p = all.filter((x) => x.label.startsWith('Ciclo Teste') && x.state === 'aberto').reverse()[0]!.id
      await dev.rpc('decide_period_rule', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p, p_person_id: id('a206'), p_percent: 50 })
      const r = await dev.rpc('approve_period', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p, p_review_revision: (await fecho(p)).review_revision })
      expect(r.error).toBeNull()
      all = (await dev.rpc('fecho_periods')).data as Row[]
    }
    const approved = all.find((x) => x.label.startsWith('Ciclo Teste') && x.state === 'pronto_para_pagamento')
    const closed = all.find((x) => x.label.startsWith('Ciclo Teste') && x.state === 'fechado')
    for (const [p, code] of [[approved, 'PERIOD_APPROVED'], [closed, 'PERIOD_CLOSED']] as const) {
      expect(p, code).toBeDefined()
      const money = (await dev.rpc('fecho_money', { p_period_id: p!.id })).data as Row
      expect((await cancel('expense', money.expenses[0].id)).error?.message).toBe(code)
      const svc = ((await dev.rpc('team_history', { p_person_id: A.person, p_period_id: p!.id, p_kind: 'service' })).data as Row).rows[0]
      expect((await cancel('service', svc.record_id)).error?.message).toBe(code)
    }
    const { devC, period, record } = await orgC()
    expect(period.state).toBe('pronto_para_pagamento')
    const g = (await devC.rpc('verify_person', { p_person_id: id('c202'), p_secret: '343434' })).data.grant_id
    expect((await cancel('service', record, 'x', randomUUID(), g, devC)).error?.message).toBe('PERIOD_APPROVED')
  })
})
