// Slice 05 — Stock Lite: human-set state with append-only history, plan membership, read models over Slice 03
// purchase lines, and the rule that a purchase never changes stock state (D-11).
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { device } from './env'

const id = (s: string) => `00000000-0000-4000-8000-00000000${s}`
const CONF = id('a202')                   // movement.confirm, PIN 222222
const A_ORIGIN = id('a501'), B_PRODUCT = id('b601')

let devA: SupabaseClient, devB: SupabaseClient

type Row = { id: string; state: string; level: string | null; reserve_units: number; on_list: boolean; planned_qty: number | null; urgent: boolean;
  marked_at: string | null; bought_today: { quantity: number; unit_word: string } | null; last_purchase: { quantity: number; line_cost_minor: number; origin: string | null } | null }

async function newProduct(c = devA): Promise<string> {
  const r = await c.rpc('create_product', { p_name: `Produto S05 ${randomUUID().slice(0, 8)}`, p_unit_word: 'frasco' })
  expect(r.error).toBeNull()
  return r.data.product_id
}
const set = (c: SupabaseClient, product: string, fields: Record<string, unknown>) =>
  c.from('products').update(fields).eq('id', product).select('id, state, level, reserve_units, on_list, planned_qty, urgent, marked_at')
async function overviewRow(c: SupabaseClient, product: string): Promise<Row | undefined> {
  const r = await c.rpc('stock_overview')
  expect(r.error).toBeNull()
  return (r.data as Row[]).find((p) => p.id === product)
}
async function buy(product: string, quantity: number, cost: number) {
  const g = await devA.rpc('verify_person', { p_person_id: CONF, p_secret: '222222' })
  const r = await devA.rpc('record_purchase', {
    p_command_id: randomUUID(), p_grant_id: g.data.grant_id,
    p_lines: [{ product_id: product, quantity, line_cost_minor: cost }],
    p_salon_amount_minor: cost, p_contributions: [], p_origin_id: A_ORIGIN,
  })
  expect(r.error).toBeNull()
}

beforeAll(async () => {
  devA = await device('TEST-ORG-A-2026')
  devB = await device('TEST-ORG-B-2026')
})

describe('human-set stock state', () => {
  it('starts OK and can be set to Baixo, Comprar and back to OK; marked_at follows', async () => {
    const p = await newProduct()
    expect((await overviewRow(devA, p))?.state).toBe('ok')
    const baixo = await set(devA, p, { state: 'baixo' })
    expect(baixo.error).toBeNull()
    expect(baixo.data?.[0].marked_at).not.toBeNull()
    expect((await set(devA, p, { state: 'comprar' })).data?.[0].state).toBe('comprar')
    const ok = await set(devA, p, { state: 'ok' })
    expect([ok.data?.[0].state, ok.data?.[0].marked_at]).toEqual(['ok', null])
    expect((await set(devA, p, { state: 'cheio' })).error?.code).toBe('23514')        // not a state
  })
  it('keeps an append-only history of state, level and reserve changes', async () => {
    const p = await newProduct()
    await set(devA, p, { state: 'baixo', level: 'metade' })
    await set(devA, p, { reserve_units: 2 })
    await set(devA, p, { on_list: true })                                             // plan only: no history row
    await set(devA, p, { state: 'ok', level: 'cheio' })
    const h = (await devA.rpc('product_state_history', { p_product_id: p })).data as { from_state: string; to_state: string; to_level: string | null; to_reserve: number }[]
    expect(h.map((x) => [x.from_state, x.to_state, x.to_level, x.to_reserve])).toEqual([
      ['ok', 'baixo', 'metade', 0], ['baixo', 'baixo', 'metade', 2], ['baixo', 'ok', 'cheio', 2]])
    expect((await devA.from('product_state_changes').select('*').limit(1)).error?.code).toBe('42501')
    expect((await devA.from('product_state_changes').delete().eq('product_id', p)).error?.code).toBe('42501')
  })
  it('validates level and reserve units; identity columns are not writable', async () => {
    const p = await newProduct()
    expect((await set(devA, p, { level: 'meio' })).error?.code).toBe('23514')
    expect((await set(devA, p, { reserve_units: -1 })).error?.code).toBe('23514')
    expect((await set(devA, p, { name: 'Outro nome' })).error?.code).toBe('42501')
    expect((await set(devA, p, { marked_at: new Date().toISOString() })).error?.code).toBe('42501')
    expect((await devA.from('products').delete().eq('id', p)).error?.code).toBe('42501')
  })
})

describe('purchase plan', () => {
  it('joining the list prefills the planned quantity from the last purchase; leaving it ends the plan', async () => {
    const p = await newProduct()
    expect((await set(devA, p, { on_list: true })).data?.[0].planned_qty).toBe(1)     // never bought
    await set(devA, p, { on_list: false })
    await buy(p, 3, 450000)
    expect((await set(devA, p, { on_list: true })).data?.[0].planned_qty).toBe(3)
    expect((await set(devA, p, { planned_qty: 2 })).data?.[0].planned_qty).toBe(2)
    expect((await set(devA, p, { planned_qty: 0 })).error?.code).toBe('23514')
    const off = await set(devA, p, { on_list: false })
    expect([off.data?.[0].on_list, off.data?.[0].planned_qty, off.data?.[0].urgent]).toEqual([false, null, false])
  })
  it('urgent puts the product on the list; leaving the list clears urgent', async () => {
    const p = await newProduct()
    const u = await set(devA, p, { urgent: true })
    expect([u.data?.[0].urgent, u.data?.[0].on_list]).toEqual([true, true])
    const off = await set(devA, p, { on_list: false })
    expect(off.data?.[0].urgent).toBe(false)
  })
})

describe('purchases never change stock state', () => {
  it('state, level, reserve and plan are exactly as before; the purchase appears as facts only', async () => {
    const p = await newProduct()
    await set(devA, p, { state: 'comprar', level: 'vazio', reserve_units: 1, urgent: true, planned_qty: 4 })
    const before = await overviewRow(devA, p)
    await buy(p, 2, 300000)
    await buy(p, 1, 160000)
    const after = await overviewRow(devA, p)
    for (const k of ['state', 'level', 'reserve_units', 'on_list', 'planned_qty', 'urgent', 'marked_at'] as const) expect(after?.[k], k).toEqual(before?.[k])
    expect(after?.bought_today).toEqual({ quantity: 3, unit_word: 'frasco' })               // derived: 2 + 1 today
    expect(after?.last_purchase).toMatchObject({ quantity: 1, line_cost_minor: 160000, origin: 'Mercado' })
    expect((await devA.rpc('product_state_history', { p_product_id: p })).data).toHaveLength(1)   // only the human change
  })
  it('purchase history lists the lines of that product, newest first, without who paid', async () => {
    const p = await newProduct()
    await buy(p, 2, 300000)
    await buy(p, 5, 700000)
    await set(devA, p, { state: 'baixo' })
    const h = (await devA.rpc('product_purchase_history', { p_product_id: p })).data
    expect(h.purchases.map((x: { quantity: number; line_cost_minor: number }) => [x.quantity, x.line_cost_minor])).toEqual([[5, 700000], [2, 300000]])
    expect(JSON.stringify(h)).not.toMatch(/contribut|salon|person|display_name/)
    expect(h.mark).toMatchObject({ state: 'baixo', days_after_purchase: 0 })
  })
  it('a product never bought has no bought-today fact and no last purchase', async () => {
    const r = await overviewRow(devA, await newProduct())
    expect([r?.bought_today, r?.last_purchase]).toEqual([null, null])
  })
})

describe('tenant isolation', () => {
  it('cannot read or change another organization\'s products or history', async () => {
    const r = await set(devA, B_PRODUCT, { state: 'comprar' })
    expect(r.error).toBeNull()
    expect(r.data).toEqual([])                                                       // RLS: no row matched
    expect((await overviewRow(devB, B_PRODUCT))?.state).toBe('ok')
    expect((await overviewRow(devA, B_PRODUCT))).toBeUndefined()
    expect((await devA.rpc('product_purchase_history', { p_product_id: B_PRODUCT })).error?.message).toBe('CROSS_TENANT_REFERENCE')
    expect((await devA.rpc('product_state_history', { p_product_id: B_PRODUCT })).error?.message).toBe('CROSS_TENANT_REFERENCE')
  })
  it('create_product reuses a same-name product in the own organization only and validates the unit word', async () => {
    const name = `Partilhado ${randomUUID().slice(0, 6)}`
    const a1 = (await devA.rpc('create_product', { p_name: name, p_unit_word: 'frasco' })).data
    const a2 = (await devA.rpc('create_product', { p_name: ` ${name.toUpperCase()} `, p_unit_word: 'frasco' })).data
    const b1 = (await devB.rpc('create_product', { p_name: name, p_unit_word: 'frasco' })).data
    expect([a1.reused, a2.reused, a2.product_id]).toEqual([false, true, a1.product_id])
    expect(b1.product_id).not.toBe(a1.product_id)
    expect((await devA.rpc('create_product', { p_name: name + 'x', p_unit_word: 'litro inventado' })).error?.message).toBe('VALIDATION_FAILED')
  })
})
