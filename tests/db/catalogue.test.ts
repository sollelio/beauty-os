// Gestão · catalogue management: only catalogue.manage changes services and products (trusted commands, one-shot
// grant); history stays as recorded; an inactive entry leaves new choices and keeps its history.
// Fixtures: "Teste Catálogo G", supabase/seeds/17_catalogue_management.sql. One anonymous device for the whole file.
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { device } from './env'

const id = (s: string) => `00000000-0000-4000-8000-0000000088${s}`
const MANAGER = id('a1'), FINANCE = id('a2'), PRO = id('a3')
const PIN: Record<string, string> = { [MANAGER]: '818181', [FINANCE]: '828282', [PRO]: '838383' }
const SVC = id('b1'), SVC2 = id('b2'), PRODUCT = id('e1'), RECORD = id('c1'), CASH = id('a0')
const OTHER_ORG_SERVICE = '00000000-0000-4000-8000-0000000077b1'      // "Teste Finanças F"
const run = Date.now().toString(36)
type Row = Record<string, any>                                       // eslint-disable-line @typescript-eslint/no-explicit-any

let dev: SupabaseClient
async function grant(person: string): Promise<string> {
  const r = await dev.rpc('verify_person', { p_person_id: person, p_secret: PIN[person] })
  expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
  return r.data.grant_id
}
async function as(person: string, fn: string, args: Row) {
  return dev.rpc(fn, { p_command_id: crypto.randomUUID(), p_grant_id: await grant(person), ...args })
}
async function ok(person: string, fn: string, args: Row): Promise<Row> {
  const r = await as(person, fn, args)
  expect(r.error, `${fn}: ${r.error?.message}`).toBeNull()
  return r.data
}
const service = async (sid: string) => (await dev.from('services').select('name, default_price_minor, active').eq('id', sid).single()).data!
const product = async (pid: string) => (await dev.from('products').select('name, unit_word, reference_price_minor, active').eq('id', pid).single()).data!
const setService = (sid: string, name: string, price: number, active = true) =>
  ok(MANAGER, 'catalogue_update_service', { p_service_id: sid, p_name: name, p_price_minor: price, p_active: active })
const setProduct = (name: string, unit: string, price: number | null, active = true) =>
  ok(MANAGER, 'catalogue_update_product', { p_product_id: PRODUCT, p_name: name, p_unit_word: unit, p_reference_price_minor: price, p_active: active })

beforeAll(async () => {
  dev = await device('TEST-ORG-G-2026')
  // the fixture's baseline (the tests change it; re-runnable)
  await setService(SVC, 'Serviço G Histórico', 500000)
  await setService(SVC2, 'Serviço G Dois', 200000)
  await setProduct('Produto G Histórico', 'unid.', null)
})

describe('authorization: catalogue.manage only, enforced by the database', () => {
  it('the private status and the confirmer list name only the catalogue.manage holder', async () => {
    for (const [person, expected] of [[MANAGER, true], [FINANCE, false], [PRO, false]] as const) {
      expect((await dev.rpc('verify_person', { p_person_id: person, p_secret: PIN[person], p_scope: 'private_session' })).data?.ok).toBe(true)
      expect((await dev.rpc('private_context_status')).data.catalogue_manage, person).toBe(expected)
    }
    await dev.rpc('end_private_context')
    expect((await dev.rpc('list_confirmers', { p_permission: 'catalogue.manage' })).data).toEqual([{ id: MANAGER, display_name: 'Gestor Catálogo G' }])
  })

  it('a finance / read-only person and a professional cannot add or change anything', async () => {
    const calls: [string, Row][] = [
      ['catalogue_add_service', { p_name: `Novo ${run}`, p_price_minor: 100 }],
      ['catalogue_update_service', { p_service_id: SVC, p_name: 'Mudado', p_price_minor: 1, p_active: false }],
      ['catalogue_add_product', { p_name: `Novo ${run}`, p_unit_word: 'unid.', p_reference_price_minor: null }],
      ['catalogue_update_product', { p_product_id: PRODUCT, p_name: 'Mudado', p_unit_word: 'unid.', p_reference_price_minor: 1, p_active: false }],
    ]
    for (const person of [FINANCE, PRO])
      for (const [fn, args] of calls) expect((await as(person, fn, args)).error?.message, `${person} ${fn}`).toBe('NOT_AUTHORIZED')
    expect((await dev.rpc('catalogue_update_service', { p_command_id: crypto.randomUUID(), p_grant_id: null, p_service_id: SVC, p_name: 'X y',
      p_price_minor: 1, p_active: true })).error?.message).toBe('VERIFICATION_REQUIRED')
    expect(await service(SVC)).toEqual({ name: 'Serviço G Histórico', default_price_minor: 500000, active: true })
    expect(await product(PRODUCT)).toEqual({ name: 'Produto G Histórico', unit_word: 'unid.', reference_price_minor: null, active: true })
  })

  it('no direct writes to the catalogue from the browser', async () => {
    expect((await dev.from('services').update({ default_price_minor: 1 }).eq('id', SVC).select()).error?.code).toBe('42501')
    expect((await dev.from('services').insert({ organization_id: '00000000-0000-4000-8000-0000000000f5', name: 'X', default_price_minor: 1 })).error?.code).toBe('42501')
    expect((await dev.from('products').update({ name: 'X', active: false, reference_price_minor: 1 }).eq('id', PRODUCT).select()).error?.code).toBe('42501')
    expect((await service(SVC)).default_price_minor).toBe(500000)
  })

  it('another organization\'s entry is not reachable', async () => {
    expect((await as(MANAGER, 'catalogue_update_service', { p_service_id: OTHER_ORG_SERVICE, p_name: 'X y', p_price_minor: 1, p_active: true })).error?.message)
      .toBe('CROSS_TENANT_REFERENCE')
  })
})

describe('services: history stays as recorded', () => {
  it('a price change only changes the prefill; the recorded value is unchanged; replay is idempotent', async () => {
    const cmd = crypto.randomUUID()
    const args = { p_command_id: cmd, p_grant_id: await grant(MANAGER), p_service_id: SVC, p_name: 'Serviço G Histórico', p_price_minor: 650000, p_active: true }
    const r = await dev.rpc('catalogue_update_service', args)
    expect(r.error).toBeNull()
    expect(r.data).toMatchObject({ before: { price_minor: 500000 }, after: { price_minor: 650000 }, changed_by_person_id: MANAGER })
    expect((await dev.rpc('catalogue_update_service', args)).data.replayed).toBe(true)
    expect((await service(SVC)).default_price_minor).toBe(650000)
    expect((await dev.from('service_records').select('value_minor, service_id').eq('id', RECORD).single()).data).toEqual({ value_minor: 450000, service_id: SVC })
    expect((await dev.from('service_record_payments').select('amount_minor').eq('service_record_id', RECORD).single()).data!.amount_minor).toBe(450000)
  })

  it('deactivated: not offered, refused for a new record; the old record and the entry stay', async () => {
    await setService(SVC, 'Serviço G Histórico', 650000, false)
    const offered = (await dev.from('services').select('id').eq('active', true)).data!.map((s) => s.id)
    expect(offered).toContain(SVC2)
    expect(offered).not.toContain(SVC)
    const rec = await dev.rpc('record_service', { p_command_id: crypto.randomUUID(), p_person_id: PRO, p_service_id: SVC, p_value_minor: 650000,
      p_payments: [{ method_id: CASH, amount_minor: 650000 }] })
    expect(rec.error?.message).toBe('CROSS_TENANT_REFERENCE')
    expect((await dev.from('service_records').select('value_minor').eq('id', RECORD).single()).data!.value_minor).toBe(450000)
    expect(await service(SVC)).toEqual({ name: 'Serviço G Histórico', default_price_minor: 650000, active: false })
    await setService(SVC, 'Serviço G Histórico', 650000, true)                 // reactivation brings it back
    expect((await dev.from('services').select('id').eq('active', true)).data!.map((s) => s.id)).toContain(SVC)
  })

  it('add a service; names are unique per organization (case-insensitive)', async () => {
    const name = `Serviço G ${run}`
    const r = await ok(MANAGER, 'catalogue_add_service', { p_name: `  ${name} `, p_price_minor: 30000 })
    expect(await service(r.service_id)).toEqual({ name, default_price_minor: 30000, active: true })
    expect((await as(MANAGER, 'catalogue_add_service', { p_name: name.toUpperCase(), p_price_minor: 1 })).error?.message).toBe('NAME_TAKEN')
    expect((await as(MANAGER, 'catalogue_update_service', { p_service_id: SVC2, p_name: 'serviço g histórico', p_price_minor: 1, p_active: true })).error?.message).toBe('NAME_TAKEN')
    expect((await as(MANAGER, 'catalogue_add_service', { p_name: 'X', p_price_minor: 1 })).error?.message).toBe('VALIDATION_FAILED')
    expect((await as(MANAGER, 'catalogue_add_service', { p_name: 'Preço negativo', p_price_minor: -1 })).error?.message).toBe('VALIDATION_FAILED')
  })
})

describe('products: history stays as recorded', () => {
  const history = async () => (await dev.rpc('product_purchase_history', { p_product_id: PRODUCT, p_limit: 5 })).data.purchases as Row[]

  it('name, unit and reference price change; the recorded purchase keeps its unit, quantity and cost', async () => {
    const r = await setProduct('Produto G Renomeado', 'pacote G', 170000)
    expect(r).toMatchObject({ before: { unit_word: 'unid.', reference_price_minor: null }, after: { unit_word: 'pacote G', reference_price_minor: 170000 } })
    expect(await product(PRODUCT)).toEqual({ name: 'Produto G Renomeado', unit_word: 'pacote G', reference_price_minor: 170000, active: true })
    expect((await dev.from('unit_words').select('word')).data!.map((w) => w.word)).toContain('pacote G')
    expect(await history()).toEqual([expect.objectContaining({ quantity: 2, unit_word: 'unid.', line_cost_minor: 300000 })])
  })

  it('deactivated: off Stock and the purchase list, refused on a new purchase line or a stock write; history stays', async () => {
    await setProduct('Produto G Histórico', 'unid.', null)
    expect((await dev.from('products').update({ on_list: true }).eq('id', PRODUCT).select('id')).data).toHaveLength(1)
    await setProduct('Produto G Histórico', 'unid.', null, false)
    const p = (await dev.from('products').select('on_list, active').eq('id', PRODUCT).single()).data!
    expect(p).toEqual({ on_list: false, active: false })
    expect(((await dev.rpc('stock_overview')).data as Row[]).map((x) => x.id)).not.toContain(PRODUCT)
    expect((await dev.from('products').select('id').eq('active', true)).data!.map((x) => x.id)).not.toContain(PRODUCT)
    expect((await dev.from('products').update({ state: 'comprar' }).eq('id', PRODUCT).select('id')).data).toHaveLength(0)
    const buy = (line: Row) => as(MANAGER, 'record_purchase', { p_lines: [{ ...line, quantity: 1, line_cost_minor: 1000 }], p_salon_amount_minor: 1000, p_contributions: [] })
    expect((await buy({ product_id: PRODUCT })).error?.message).toBe('CATALOGUE_INACTIVE')
    expect((await buy({ new_product: { name: 'produto g histórico', unit_word: 'unid.' } })).error?.message).toBe('CATALOGUE_INACTIVE')
    expect((await dev.rpc('create_product', { p_name: 'Produto G Histórico', p_unit_word: 'unid.' })).error?.message).toBe('CATALOGUE_INACTIVE')
    expect(await history()).toEqual([expect.objectContaining({ quantity: 2, unit_word: 'unid.', line_cost_minor: 300000 })])
    await setProduct('Produto G Histórico', 'unid.', null, true)
    expect(((await dev.rpc('stock_overview')).data as Row[]).map((x) => x.id)).toContain(PRODUCT)
  })

  it('add a product with a new unit word and a reference price; duplicate names refused', async () => {
    const name = `Produto G ${run}`
    const r = await ok(MANAGER, 'catalogue_add_product', { p_name: name, p_unit_word: 'conjunto', p_reference_price_minor: 100000 })
    expect(await product(r.product_id)).toEqual({ name, unit_word: 'conjunto', reference_price_minor: 100000, active: true })
    expect((await as(MANAGER, 'catalogue_add_product', { p_name: name.toLowerCase(), p_unit_word: 'unid.', p_reference_price_minor: null })).error?.message).toBe('NAME_TAKEN')
    await ok(MANAGER, 'catalogue_update_product', { p_product_id: r.product_id, p_name: name, p_unit_word: 'conjunto', p_reference_price_minor: null, p_active: false })
  })
})
