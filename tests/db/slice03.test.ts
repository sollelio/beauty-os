import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { A, B, device } from './env'

const CONF = '00000000-0000-4000-8000-00000000a202'    // movement.confirm, PIN 222222
const CONF2 = '00000000-0000-4000-8000-00000000a204'   // movement.confirm, PIN 555555
const NOPERM = A.person                                 // PIN 111111, no permission
const A_CAT = '00000000-0000-4000-8000-00000000a401', B_CAT = '00000000-0000-4000-8000-00000000b401'
const A_ORIGIN = '00000000-0000-4000-8000-00000000a501', B_ORIGIN = '00000000-0000-4000-8000-00000000b501'
const A_PRODUCT = '00000000-0000-4000-8000-00000000a601', B_PRODUCT = '00000000-0000-4000-8000-00000000b601'

let devA: SupabaseClient, devA2: SupabaseClient

async function grant(c: SupabaseClient, person = CONF, secret = '222222'): Promise<string> {
  const r = await c.rpc('verify_person', { p_person_id: person, p_secret: secret })
  expect(r.data?.ok).toBe(true)
  return r.data.grant_id
}
const expense = (c: SupabaseClient, cmd: string, g: string | null, over: Record<string, unknown> = {}) => c.rpc('record_expense', {
  p_command_id: cmd, p_grant_id: g, p_category_id: A_CAT, p_amount_minor: 900000,
  p_payments: [{ method_id: A.cash, amount_minor: 900000 }], p_note: 'teste', ...over,
})
const purchase = (c: SupabaseClient, cmd: string, g: string | null, over: Record<string, unknown> = {}) => c.rpc('record_purchase', {
  p_command_id: cmd, p_grant_id: g,
  p_lines: [{ product_id: A_PRODUCT, quantity: 2, line_cost_minor: 1400000 }],
  p_salon_amount_minor: 1400000, p_contributions: [], p_origin_id: A_ORIGIN, ...over,
})

beforeAll(async () => {
  devA = await device('TEST-ORG-A-2026')
  devA2 = await device('TEST-ORG-A-2026')
})

describe('record_expense', () => {
  it('records a single-method expense confirmed by the verified person', async () => {
    const r = await expense(devA, randomUUID(), await grant(devA))
    expect(r.error).toBeNull()
    expect(r.data.confirmed_by_person_id).toBe(CONF)
  })
  it('records a mixed payment only when the parts add up', async () => {
    const g = await grant(devA)
    expect((await expense(devA, randomUUID(), g, { p_payments: [{ method_id: A.cash, amount_minor: 500000 }, { method_id: A.transfer, amount_minor: 300000 }] })).error?.message).toBe('MIXED_PAYMENT_MISMATCH')
    expect((await expense(devA, randomUUID(), g, { p_payments: [{ method_id: A.cash, amount_minor: 500000 }, { method_id: A.transfer, amount_minor: 400000 }] })).error).toBeNull()
  })
  it('rejects a zero amount and a too-long note', async () => {
    const g = await grant(devA)
    expect((await expense(devA, randomUUID(), g, { p_amount_minor: 0, p_payments: [{ method_id: A.cash, amount_minor: 0 }] })).error?.message).toBe('VALIDATION_FAILED')
    expect((await expense(devA, randomUUID(), g, { p_note: 'x'.repeat(61) })).error?.message).toBe('VALIDATION_FAILED')
  })
  it('requires a valid grant of a permitted person', async () => {
    expect((await expense(devA, randomUUID(), null)).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await expense(devA, randomUUID(), await grant(devA, NOPERM, '111111'))).error?.message).toBe('NOT_AUTHORIZED')
    expect((await expense(devA2, randomUUID(), await grant(devA))).error?.message).toBe('VERIFICATION_REQUIRED')   // other device
  })
  it('rejects references from another organization', async () => {
    for (const over of [{ p_category_id: B_CAT }, { p_payments: [{ method_id: B.cash, amount_minor: 900000 }] }, { p_declared_operator_id: B.person }]) {
      expect((await expense(devA, randomUUID(), await grant(devA), over)).error?.message).toBe('CROSS_TENANT_REFERENCE')
    }
  })
  it('replays, conflicts, and executes concurrent duplicates once', async () => {
    const cmd = randomUUID()
    const first = await expense(devA, cmd, await grant(devA))
    const again = await expense(devA, cmd, null)
    expect(again.data).toMatchObject({ expense_id: first.data.expense_id, replayed: true })
    expect((await expense(devA, cmd, null, { p_amount_minor: 100, p_payments: [{ method_id: A.cash, amount_minor: 100 }] })).error?.message).toBe('IDEMPOTENCY_CONFLICT')
    const c2 = randomUUID(), g = await grant(devA)
    const all = await Promise.all(Array.from({ length: 6 }, () => expense(devA, c2, g)))
    expect(all.every((r) => r.error === null)).toBe(true)
    expect(new Set(all.map((r) => r.data.expense_id)).size).toBe(1)
    expect(all.filter((r) => !r.data.replayed)).toHaveLength(1)
  })
})

describe('record_purchase', () => {
  it('records lines (existing + new product) and contributions atomically', async () => {
    const name = `Produto Novo ${randomUUID().slice(0, 8)}`
    const r = await purchase(devA, randomUUID(), await grant(devA), {
      p_lines: [{ product_id: A_PRODUCT, quantity: 2, line_cost_minor: 1400000 }, { new_product: { name, unit_word: 'unid.' }, quantity: 3, line_cost_minor: 900000 }],
      p_salon_amount_minor: 1450000, p_contributions: [{ person_id: A.person, amount_minor: 850000 }],
    })
    expect(r.error).toBeNull()
    expect(r.data).toMatchObject({ total_minor: 2300000, line_count: 2, new_product_count: 1, salon_amount_minor: 1450000, confirmed_by_person_id: CONF })
    expect(r.data.contributors).toEqual([{ person_id: A.person, display_name: 'Pessoa Teste A', amount_minor: 850000 }])
    expect((await devA.from('products').select('name, unit_word').eq('name', name)).data).toEqual([{ name, unit_word: 'unid.' }])
  })
  it('is all-or-nothing: a rejected purchase creates no new product', async () => {
    const name = `Nunca Criado ${randomUUID().slice(0, 8)}`
    const r = await purchase(devA, randomUUID(), await grant(devA), {
      p_lines: [{ new_product: { name, unit_word: 'frasco' }, quantity: 1, line_cost_minor: 100000 }, { product_id: B_PRODUCT, quantity: 1, line_cost_minor: 100000 }],
      p_salon_amount_minor: 200000,
    })
    expect(r.error?.message).toBe('CROSS_TENANT_REFERENCE')
    expect((await devA.from('products').select('id').eq('name', name)).data).toEqual([])
  })
  it('requires contributions to equal the total', async () => {
    const g = await grant(devA)
    expect((await purchase(devA, randomUUID(), g, { p_salon_amount_minor: 1000000 })).error?.message).toBe('CONTRIBUTIONS_MISMATCH')
    expect((await purchase(devA, randomUUID(), g, { p_contributions: [{ person_id: A.person, amount_minor: 1 }] })).error?.message).toBe('CONTRIBUTIONS_MISMATCH')
  })
  it('accepts a zero salon contribution when another person pays everything', async () => {
    const r = await purchase(devA, randomUUID(), await grant(devA), { p_salon_amount_minor: 0, p_contributions: [{ person_id: A.person, amount_minor: 1400000 }] })
    expect(r.error).toBeNull()
    expect(r.data.salon_amount_minor).toBe(0)
    expect(r.data.contributors).toHaveLength(1)
  })
  it('validates lines and contributors', async () => {
    const g = await grant(devA)
    const bad = [
      { p_lines: [] },
      { p_lines: [{ product_id: A_PRODUCT, quantity: 0, line_cost_minor: 1400000 }] },
      { p_lines: [{ new_product: { name: 'Sem unidade válida', unit_word: 'litro' }, quantity: 1, line_cost_minor: 1400000 }] },
      { p_lines: [{ product_id: A_PRODUCT, quantity: 1, line_cost_minor: 700000 }, { product_id: A_PRODUCT, quantity: 1, line_cost_minor: 700000 }] },
      { p_salon_amount_minor: 1400000, p_contributions: [{ person_id: A.person, amount_minor: 0 }] },
    ]
    for (const over of bad) expect((await purchase(devA, randomUUID(), g, over)).error?.message).toBe('VALIDATION_FAILED')
  })
  it('reuses an existing product when a "new" product has the same name', async () => {
    const r = await purchase(devA, randomUUID(), await grant(devA), {
      p_lines: [{ new_product: { name: 'produto teste a', unit_word: 'unid.' }, quantity: 1, line_cost_minor: 1400000 }],
    })
    expect(r.error).toBeNull()
    expect(r.data.new_product_count).toBe(0)
  })
  it('rejects references from another organization', async () => {
    for (const over of [
      { p_lines: [{ product_id: B_PRODUCT, quantity: 1, line_cost_minor: 1400000 }] },
      { p_salon_amount_minor: 0, p_contributions: [{ person_id: B.person, amount_minor: 1400000 }] },
      { p_origin_id: B_ORIGIN },
    ]) expect((await purchase(devA, randomUUID(), await grant(devA), over)).error?.message).toBe('CROSS_TENANT_REFERENCE')
  })
  it('a retry is never authorized by another person\'s later verification', async () => {
    const g1 = await grant(devA)
    const cmd = randomUUID()
    expect((await purchase(devA, cmd, g1, { p_salon_amount_minor: 1 })).error?.message).toBe('CONTRIBUTIONS_MISMATCH')   // fails, g1 unused
    await grant(devA, CONF2, '555555')                                                                                   // someone else verifies
    expect((await purchase(devA, cmd, g1)).error?.message).toBe('VERIFICATION_REQUIRED')
    const r = await purchase(devA, cmd, await grant(devA))
    expect(r.data.confirmed_by_person_id).toBe(CONF)
  })
  it('replays, conflicts, and executes concurrent duplicates once', async () => {
    const cmd = randomUUID()
    const first = await purchase(devA, cmd, await grant(devA))
    expect((await purchase(devA, cmd, null)).data).toMatchObject({ purchase_id: first.data.purchase_id, replayed: true })
    expect((await purchase(devA, cmd, null, { p_origin_id: null })).error?.message).toBe('IDEMPOTENCY_CONFLICT')
    const c2 = randomUUID(), g = await grant(devA)
    const all = await Promise.all(Array.from({ length: 6 }, () => purchase(devA, c2, g)))
    expect(all.every((r) => r.error === null)).toBe(true)
    expect(new Set(all.map((r) => r.data.purchase_id)).size).toBe(1)
    expect(all.filter((r) => !r.data.replayed)).toHaveLength(1)
  })
})

describe('no direct access to financial records', () => {
  it('denies direct select and DML on expenses and purchases', async () => {
    for (const t of ['expenses', 'expense_payments', 'purchases', 'purchase_lines', 'purchase_contributions']) {
      expect((await devA.from(t).select('*')).error?.code).toBe('42501')
    }
    expect((await devA.from('expenses').insert({ organization_id: A.org })).error?.code).toBe('42501')
    expect((await devA.from('purchases').insert({ organization_id: A.org })).error?.code).toBe('42501')
    expect((await devA.from('products').insert({ organization_id: A.org, name: 'Direct', unit_word: 'unid.' })).error?.code).toBe('42501')
  })
  it('reads only its own organization\'s capture lists', async () => {
    for (const t of ['expense_categories', 'purchase_origins', 'products', 'unit_words']) {
      const rows = (await devA.from(t).select('organization_id')).data!
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((x) => x.organization_id === A.org)).toBe(true)
    }
  })
})
