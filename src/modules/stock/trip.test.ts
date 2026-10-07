import { describe, expect, it, beforeEach } from 'vitest'
import type { StockProduct } from './api'
import { addUnplanned, boughtItems, buildTrip, clearTrip, endedPlanIds, isSubstituted, loadTrip, revertSubstitute, saveTrip, skip, substitute, toggle, tripCounts } from './trip'

const product = (id: string, name: string, unit: string, over: Partial<StockProduct> = {}): StockProduct => ({
  id, name, unit_word: unit, purpose: null, state: 'comprar', level: null, reserve_units: 0, marked_at: null,
  on_list: true, planned_qty: 2, urgent: false, last_purchase: null, bought_today: null, ...over,
})
const shampoo = product('s5', 'Shampoo 5 L', 'garrafão')
const gel = product('g', 'Gel para unhas', 'frasco', { planned_qty: 3 })
const laminas = product('l', 'Lâminas', 'caixa', { urgent: true, planned_qty: 1 })
const key = (t: ReturnType<typeof buildTrip>, name: string) => t.items.find((i) => i.name === name || i.plannedName === name)!.key

beforeEach(() => localStorage.clear())

describe('market trip draft', () => {
  it('is built from the list: urgent first, planned quantities, nothing bought', () => {
    const t = buildTrip([shampoo, gel, laminas, product('x', 'Fora da lista', 'unid.', { on_list: false })], null)
    expect(t.items.map((i) => [i.name, i.qty, i.status])).toEqual([['Lâminas', 1, 'pending'], ['Shampoo 5 L', 2, 'pending'], ['Gel para unhas', 3, 'pending']])
    expect(tripCounts(t)).toMatchObject({ bought: 0, pending: 3, skipped: 0, progress: '0 de 3' })
  })
  it('counts bought / pending / skipped; skipped items leave the denominator', () => {
    let t = buildTrip([shampoo, gel, laminas], null)
    t = toggle(t, key(t, 'Lâminas'))
    t = skip(t, key(t, 'Gel para unhas'))
    expect(tripCounts(t)).toMatchObject({ bought: 1, pending: 1, skipped: 1, progress: '1 de 2' })
  })
  it('substitution: the row becomes the substitute; un-checking or "voltar" undoes it', () => {
    let t = buildTrip([shampoo], null)
    t = substitute(t, key(t, 'Shampoo 5 L'), { productId: 's3', name: 'Shampoo 3 L', unitWord: 'garrafão' })
    const row = t.items[0]!
    expect([row.name, row.productId, row.status, isSubstituted(row), row.plannedName]).toEqual(['Shampoo 3 L', 's3', 'bought', true, 'Shampoo 5 L'])
    expect(endedPlanIds(t)).toEqual(['s5'])                            // the planned entry's plan ends; its state is not touched
    const undone = toggle(t, row.key).items[0]!
    expect([undone.name, undone.productId, undone.status]).toEqual(['Shampoo 5 L', 's5', 'pending'])
    const reverted = revertSubstitute(t, row.key).items[0]!
    expect([reverted.name, reverted.status]).toEqual(['Shampoo 5 L', 'bought'])
  })
  it('a new substitute product carries its name and unit word for the purchase', () => {
    let t = buildTrip([shampoo], null)
    t = substitute(t, t.items[0]!.key, { productId: null, name: 'Shampoo 3 L', unitWord: 'frasco' })
    expect(boughtItems(t).map((i) => [i.productId, i.name, i.unitWord])).toEqual([[null, 'Shampoo 3 L', 'frasco']])
  })
  it('unplanned items merge into an existing row for the same product; un-checking removes them', () => {
    let t = buildTrip([shampoo], null)
    t = addUnplanned(t, { productId: 's5', name: 'Shampoo 5 L', unitWord: 'garrafão' }, 1)
    expect(t.items).toHaveLength(1)
    expect([t.items[0]!.status, t.items[0]!.qty]).toEqual(['bought', 1])
    t = addUnplanned(t, { productId: null, name: 'Algodão', unitWord: 'pacote' }, 2)
    expect(t.items.map((i) => [i.name, i.unplanned, i.status])).toContainEqual(['Algodão', true, 'bought'])
    t = toggle(t, key(t, 'Algodão'))
    expect(t.items.some((i) => i.name === 'Algodão')).toBe(false)
  })
  it('re-entering rebuilds from the current list and keeps progress on items still listed', () => {
    let t = buildTrip([shampoo, gel], null)
    t = toggle(t, key(t, 'Gel para unhas'))
    t = addUnplanned(t, { productId: 'l', name: 'Lâminas', unitWord: 'caixa' }, 2)
    const again = buildTrip([gel, laminas, product('s5', 'Shampoo 5 L', 'garrafão', { on_list: false })], t)
    expect(again.items.map((i) => [i.name, i.status, i.qty, i.unplanned])).toEqual([
      ['Lâminas', 'bought', 2, false],                                   // unplanned item now on the list: not duplicated
      ['Gel para unhas', 'bought', 3, false],                            // progress kept
    ])
  })
  it('survives navigation and reloads in local storage, per organization, until cleared', () => {
    const t = toggle(buildTrip([shampoo], null), buildTrip([shampoo], null).items[0]!.key)
    saveTrip('org-a', t)
    expect(loadTrip('org-b')).toBeNull()
    expect(loadTrip('org-a')).toEqual(t)
    clearTrip('org-a')
    expect(loadTrip('org-a')).toBeNull()
  })
})
