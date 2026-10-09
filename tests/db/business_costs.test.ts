// Business Health Slice 04 — business_costs read model (supabase/migrations/20261010000500) and the cost/stock insights
// built from it (src/modules/business/insights.ts). Fixtures: "Teste Custos K", supabase/seeds/13_business_costs.sql.
// One anonymous device for the whole file: the people switch by opening a new private session (it supersedes).
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { device } from './env'
import { buildInsights, costInsights } from '../../src/modules/business/insights'
import type { BusinessCosts, BusinessHealth } from '../../src/modules/business/types'

const id = (s: string) => `00000000-0000-4000-8000-0000000066${s}`
const K = (kz: number) => kz * 100
const MANAGER = id('a5'), BUSINESS_ONLY = id('a6'), NO_PERMS = id('a7')
const PIN: Record<string, string> = { [MANAGER]: '818181', [BUSINESS_ONLY]: '828282', [NO_PERMS]: '838383' }
const A_OCT = '00000000-0000-4000-8000-0000000ca802'           // a period of test organization A
const money = (m: number) => `${m / 100} Kz`
const numbers = (v: unknown): number[] => typeof v === 'number' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(numbers) : []

let dev: SupabaseClient
const P: Record<string, string> = {}
async function as(person: string) {
  const r = await dev.rpc('verify_person', { p_person_id: person, p_secret: PIN[person], p_scope: 'private_session' })
  expect(r.data?.ok, JSON.stringify(r.data)).toBe(true)
}
async function costs(label: string): Promise<BusinessCosts> {
  const r = await dev.rpc('business_costs', { p_period_id: P[label] })
  expect(r.error, r.error?.message).toBeNull()
  return r.data
}
const health = async (label: string) => (await dev.rpc('business_health', { p_period_id: P[label] })).data as BusinessHealth
const err = async (fn: string, args: Record<string, unknown> = {}) => (await dev.rpc(fn, args)).error?.message
const cat = (c: BusinessCosts, label: string) => c.expenses.find((x) => x.label === label)!

beforeAll(async () => {
  dev = await device('TEST-ORG-K-2026')
  await as(BUSINESS_ONLY)
  for (const p of (await dev.rpc('business_periods')).data as { id: string; label: string }[]) P[p.label] = p.id
})

describe('access', () => {
  it('requires a private session, then business.health.read; another organization\'s period is rejected', async () => {
    await dev.rpc('end_private_context')
    expect(await err('business_costs')).toBe('VERIFICATION_REQUIRED')
    await as(NO_PERMS)
    expect(await err('business_costs', { p_period_id: P['Semana K4'] })).toBe('NOT_AUTHORIZED')
    await as(BUSINESS_ONLY)
    expect(await err('business_costs', { p_period_id: A_OCT })).toBe('CROSS_TENANT_REFERENCE')
  })
})

describe('costs (business-only viewer)', () => {
  it('summary and expense categories: totals, shares of expenses and of production; the cancelled expense excluded', async () => {
    const c = await costs('Semana K4')
    expect(c.summary).toEqual({ production_minor: K(200000), expenses_minor: K(55000), purchases_salon_minor: null,   // one contributor: hidden
      expenses_pct_of_production: 27.5, purchases_pct_of_production: null, purchases_private: true, products_attention: 2 })
    expect(c.expenses.map((x) => x.label)).toEqual(['Renda', 'Materiais', 'Luz'])
    expect(cat(c, 'Materiais')).toMatchObject({ current_minor: K(18000), share_of_expenses_pct: 32.7, share_of_production_pct: 9 })   // not 68.000
    expect(cat(c, 'Renda')).toMatchObject({ share_of_expenses_pct: 54.5, share_of_production_pct: 15 })
    const h = await health('Semana K4')
    expect(c.summary.expenses_minor).toBe(h.current.expenses_minor)
    expect(c.summary.purchases_salon_minor).toBe(h.current.purchases_salon_minor)
  })

  it('previous and average of 3 (Slice 01 rule); insufficient history and no previous say why', async () => {
    const m = cat(await costs('Semana K4'), 'Materiais')
    expect(m).toMatchObject({ previous_minor: K(11000), average_3_minor: K(11000), reference_presence: 3,
      change_previous: { delta_minor: K(7000), percent: 63.6 }, change_average_3: { delta_minor: K(7000), percent: 63.6 } })
    const k3 = await costs('Semana K3')
    expect(k3.comparison.average_3).toMatchObject({ available: false, reason: 'insufficient_history' })
    expect(cat(k3, 'Materiais')).toMatchObject({ average_3_minor: null, change_average_3: null, change_previous: { delta_minor: -K(1000) } })
    const k1 = await costs('Semana K1')
    expect(k1.comparison.previous).toMatchObject({ available: false, reason: 'no_previous_period' })
    expect(k1.expenses.every((x) => x.change_previous === null)).toBe(true)
    expect(k1.purchases.change).toBeNull()
  })

  it('zero production and zero expenses: no shares, no percentages', async () => {
    const c = await costs('Semana K5')
    expect(c.summary).toMatchObject({ production_minor: 0, expenses_minor: 0, purchases_salon_minor: 0, expenses_pct_of_production: null, purchases_pct_of_production: null,
      purchases_private: false })
    expect(c.expenses.every((x) => x.current_minor === 0 && x.share_of_expenses_pct === null && x.share_of_production_pct === null)).toBe(true)
    expect(c.purchases.products).toEqual([])
  })

  it('purchase contributions (B11): one other contributor hides the salon-funded figures; two keep the aggregate', async () => {
    const k4 = await costs('Semana K4')                                   // A alone contributed
    expect(k4.purchases).toMatchObject({ salon_minor: null, private: true, change: { delta_minor: null, percent: null } })
    expect(k4.purchases.products.map((x) => [x.name, x.purchases_count, x.quantity, x.salon_minor])).toEqual([['Acetona', 3, 3, null], ['Luvas', 1, 2, null]])
    const h4 = await health('Semana K4')
    expect(h4.current).toMatchObject({ purchases_salon_minor: null, operating_costs_minor: null, operating_result_minor: null, retention_pct: null, free_minor: null })
    expect(h4.current.private_fields).toEqual(['purchases_salon_minor', 'operating_costs_minor', 'operating_result_minor', 'retention_pct', 'free_minor'])
    expect(h4.current.team_earnings_minor).toBe(K(80000))                  // two earners: still shown
    const k6 = await costs('Semana K6')                                   // A and B contributed
    expect(k6.purchases).toMatchObject({ salon_minor: K(9000), private: false })
    expect(k6.summary.purchases_pct_of_production).toBe(9)
    expect((await health('Semana K6')).current.private_fields).toEqual([])
    const k7 = await costs('Semana K7')                                   // the viewer and A: A's part would be known
    expect(k7.purchases).toMatchObject({ salon_minor: null, private: true })
    expect(k7.purchases.products[0]!.salon_minor).toBeNull()
  })

  it('a hidden figure enters no comparison, average or trend', async () => {
    const k5 = await costs('Semana K5')
    expect(k5.purchases).toMatchObject({ salon_minor: 0, private: false, previous_private: true, previous_salon_minor: null, change: { delta_minor: null, percent: null } })
    const h5 = await health('Semana K5')
    expect(h5.changes.previous!.purchases_salon_minor).toEqual({ delta_minor: null, percent: null })
    expect(h5.trend.find((t) => t.label === 'Semana K4')).toMatchObject({ operating_result_minor: null, result_private: true })
  })

  it('stock: the human-set state now, and purchases and marks in the 30 days up to the period\'s end', async () => {
    const s = (await costs('Semana K4')).stock
    expect(s).toMatchObject({ baixo: 1, comprar: 1, on_list: 1, urgent: 1, window: { days: 30, from: '2025-07-05', to: '2025-08-03' } })
    expect(s.attention.map((x) => [x.name, x.state, x.urgent])).toEqual([['Acetona', 'comprar', true], ['Algodão', 'baixo', false]])
    expect(s.activity.map((x) => [x.name, x.purchases, x.marks])).toEqual([['Acetona', 4, 3], ['Algodão', 1, 3], ['Luvas', 1, 1]])
    expect(JSON.stringify(s)).not.toMatch(/level|reserve|remaining|consum|forecast/)
  })

  it('no person, no contribution, no gross purchase total, in any period', async () => {
    for (const label of ['Semana K1', 'Semana K2', 'Semana K3', 'Semana K4', 'Semana K5']) {
      const c = await costs(label)
      expect(Object.keys(c).sort(), label).toEqual(['comparison', 'expenses', 'period', 'purchases', 'stock', 'summary'])
      expect(Object.keys(c.purchases).sort(), label).toEqual(['change', 'previous_private', 'previous_salon_minor', 'private', 'products', 'salon_minor'])
      expect(JSON.stringify(c).match(/.{20}(Profissional|66a[1-7]|person|contribut|display_name|total_minor|gross|earned|advance).{10}/)?.[0], label).toBeUndefined()
    }
    const seen = numbers(await costs('Semana K4'))
    expect(seen).not.toContain(K(26000))                                             // gross purchases of K4
    expect(seen).not.toContain(K(3000))                                              // the person's contribution
  })
})

describe('insights', () => {
  it('expense category high (insight 5, reused): Materiais, with its share of production', async () => {
    const r = buildInsights(await health('Semana K4'), money)
    const e = r.insights.find((i) => i.kind === 'expense_category_high')!
    expect(e).toMatchObject({ severity: 'ATTENTION', title: 'Materiais: 64% acima da média dos últimos 3 períodos.' })
    expect(e.detail.current).toBe('Materiais 18000 Kz (9% da produção)')
    expect(e.detail.basis).toBe('Média de Semana K3, Semana K2, Semana K1 (fechados).')            // Luz: +31% but below 3% of production
    expect(buildInsights(await health('Semana K3'), money).skipped).toContainEqual({ kind: 'expense_category_high', reason: 'insufficient_history' })
  })

  it('salon purchases up: not built from a hidden figure', async () => {
    expect(costInsights(await costs('Semana K4'), money).skipped).toContainEqual({ kind: 'purchases_up', reason: 'figure_hidden' })
    expect(costInsights(await costs('Semana K5'), money).skipped).toContainEqual({ kind: 'purchases_up', reason: 'figure_hidden' })   // previous hidden
    expect(costInsights(await costs('Semana K1'), money).skipped).toContainEqual({ kind: 'purchases_up', reason: 'no_previous_period' })
    expect(costInsights(await costs('Semana K3'), money).insights.map((i) => i.kind)).not.toContain('purchases_up')   // from 0: no percentage
  })

  it('products needing repeated attention: bought or marked ≥ 3 times in 30 days, both signals combined, one card', async () => {
    const a = costInsights(await costs('Semana K4'), money).insights.find((i) => i.kind === 'product_attention')!
    expect(a).toMatchObject({ severity: 'ATTENTION', title: '2 produtos merecem atenção nos últimos 30 dias.' })
    expect(a.detail.current).toBe('Acetona: 4 compras · 3 marcações · Algodão: 1 compra · 3 marcações')   // Luvas: 1 and 1
    expect(a.detail.confidence).toContain('o sistema não mede o consumo')
    expect(costInsights(await costs('Semana K3'), money).insights.map((i) => i.kind)).not.toContain('product_attention')
  })

  it('they join the overview insights, at most 5; nothing names a hidden amount', async () => {
    const r = buildInsights(await health('Semana K4'), money, undefined, undefined, undefined, await costs('Semana K4'))
    const k = r.insights.map((i) => i.kind)
    expect(k).toEqual(expect.arrayContaining(['expense_category_high', 'product_attention']))
    expect(k).not.toContain('purchases_up')
    expect(JSON.stringify(r.insights)).not.toMatch(/23000 Kz|Acetona 18000|Luvas 5000/)
    expect(k.length).toBeLessThanOrEqual(5)
  })
})

describe('team.finance.read viewer', () => {
  beforeAll(async () => { await as(MANAGER) })

  it('sees the salon-funded figures, per product, and the purchases-up insight; still no contributor detail', async () => {
    const c = await costs('Semana K4')
    expect(c.purchases).toMatchObject({ salon_minor: K(23000), private: false, previous_salon_minor: K(10000), change: { delta_minor: K(13000), percent: 130 } })
    expect(c.purchases.products.map((x) => [x.name, x.purchases_count, x.quantity, x.salon_minor])).toEqual([
      ['Acetona', 3, 3, K(18000)], ['Luvas', 1, 2, K(5000)]])                        // Luvas 8.000, of which 3.000 paid by a person; the cancelled Acetona excluded
    expect(c.purchases.products[0]!.last_purchased_at.slice(0, 10)).toBe('2025-07-30')
    expect(c.summary.purchases_pct_of_production).toBe(11.5)
    const up = costInsights(c, money).insights.find((i) => i.kind === 'purchases_up')!
    expect(up).toMatchObject({ severity: 'ATTENTION', title: 'As compras suportadas pelo salão aumentaram 130%.' })
    expect(up.detail.drivers.map((d) => d.label)).toEqual(['Acetona', 'Luvas'])
    expect(up.detail.confidence).toContain('não indica que tenham sido a causa')
    expect((await costs('Semana K7')).purchases.salon_minor).toBe(K(5000))
    expect(JSON.stringify(c)).not.toMatch(/person|contribut|Profissional/)
  })
})

describe('Stock Lite: a cancelled purchase is not a purchase', () => {
  it('last purchase is the latest active one; history leaves the cancelled out; line costs stay on the shared screen', async () => {
    const acet = ((await dev.rpc('stock_overview')).data as { name: string; last_purchase: { occurred_at: string; line_cost_minor: number } }[]).find((p) => p.name === 'Acetona')!
    expect(acet.last_purchase.occurred_at.slice(0, 10)).toBe('2025-07-30')        // the cancelled one was 2025-07-31
    expect(acet.last_purchase.line_cost_minor).toBe(K(6000))
    const hist = (await dev.rpc('product_purchase_history', { p_product_id: id('e1'), p_limit: 10 })).data as { purchases: { occurred_at: string; line_cost_minor: number }[] }
    expect(hist.purchases.map((x) => x.occurred_at.slice(0, 10))).toEqual(['2025-07-30', '2025-07-29', '2025-07-28', '2025-07-23'])
    expect(hist.purchases.every((x) => x.line_cost_minor === K(6000))).toBe(true)
  })
})
