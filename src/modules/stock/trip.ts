// Modo mercado working state (Slice 05 K4–K6): a client-side draft, never a business record. It lives on this
// device until the real purchase is recorded through the Slice 03 command; only then is it cleared. Nothing in it
// enters Dinheiro or Stock by itself.
import type { StockProduct } from './api'

export type TripStatus = 'pending' | 'bought' | 'skipped'
export type TripItem = {
  key: string
  plannedId: string | null; plannedName: string | null; plannedUnit: string | null; plannedQty: number | null   // the list entry it came from
  productId: string | null; name: string; unitWord: string                            // what goes to the purchase
  qty: number; status: TripStatus; urgent: boolean; unplanned: boolean
}
export type Trip = { items: TripItem[] }
export type PickedProduct = { productId: string | null; name: string; unitWord: string }

const STORAGE = (orgId: string) => `beauty-os.trip.${orgId}`
const same = (a: string, b: string) => a.trim().toLocaleLowerCase('pt-PT') === b.trim().toLocaleLowerCase('pt-PT')
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)

export function loadTrip(orgId: string): Trip | null {
  try { const raw = localStorage.getItem(STORAGE(orgId)); return raw ? (JSON.parse(raw) as Trip) : null } catch { return null }
}
export function saveTrip(orgId: string, trip: Trip) {
  try { localStorage.setItem(STORAGE(orgId), JSON.stringify(trip)) } catch { /* the trip still works in memory */ }
}
export function clearTrip(orgId: string) {
  try { localStorage.removeItem(STORAGE(orgId)) } catch { /* nothing stored */ }
}

/** Rebuild from the current list on each entry, keeping progress on items still listed (Slice 05 §3). */
export function buildTrip(list: StockProduct[], prev: Trip | null): Trip {
  const old = prev?.items ?? []
  const listed = list.filter((p) => p.on_list)
  const planned: TripItem[] = listed.map((p) => {
    const kept = old.find((i) => i.plannedId === p.id)
    if (kept) return { ...kept, plannedName: p.name, plannedUnit: p.unit_word, plannedQty: p.planned_qty, urgent: p.urgent }
    const wasUnplanned = old.find((i) => i.unplanned && i.productId === p.id)
    return {
      key: newKey(), plannedId: p.id, plannedName: p.name, plannedUnit: p.unit_word, plannedQty: p.planned_qty,
      productId: p.id, name: p.name, unitWord: p.unit_word, qty: wasUnplanned?.qty ?? p.planned_qty ?? 1,
      status: wasUnplanned ? 'bought' : 'pending', urgent: p.urgent, unplanned: false,
    }
  })
  const unplanned = old.filter((i) => i.unplanned && !listed.some((p) => p.id === i.productId))
  const items = [...planned, ...unplanned].sort((a, b) => Number(b.urgent) - Number(a.urgent))
  return { items }
}

const patch = (trip: Trip, key: string, f: (i: TripItem) => TripItem | null): Trip =>
  ({ items: trip.items.flatMap((i) => (i.key === key ? [f(i)].filter((x): x is TripItem => x !== null) : [i])) })

const backToPlanned = (i: TripItem): TripItem =>
  i.plannedId && i.productId !== i.plannedId
    ? { ...i, productId: i.plannedId, name: i.plannedName ?? i.name, unitWord: i.plannedUnit ?? i.unitWord, qty: i.plannedQty ?? i.qty }
    : i

/** The circular check: pending ↔ bought; un-checking undoes a substitution or removes an unplanned item. */
export function toggle(trip: Trip, key: string): Trip {
  return patch(trip, key, (i) => {
    if (i.status === 'pending' || i.status === 'skipped') return { ...i, status: 'bought' }
    if (i.unplanned) return null
    return { ...backToPlanned(i), status: 'pending' }
  })
}
export const setQty = (trip: Trip, key: string, qty: number) => patch(trip, key, (i) => ({ ...i, qty: Math.min(9999, Math.max(1, qty)) }))
export const skip = (trip: Trip, key: string) => patch(trip, key, (i) => ({ ...backToPlanned(i), status: 'skipped' }))
export const removeUnplanned = (trip: Trip, key: string) => patch(trip, key, (i) => (i.unplanned ? null : i))

/** "Não há · levei outro produto": the row becomes the substitute, bought; the planned product keeps its mark. */
export function substitute(trip: Trip, key: string, p: PickedProduct): Trip {
  return patch(trip, key, (i) => ({ ...i, productId: p.productId, name: p.name, unitWord: p.unitWord, status: 'bought' }))
}
export const revertSubstitute = (trip: Trip, key: string) => patch(trip, key, backToPlanned)
export const isSubstituted = (i: TripItem) => i.plannedId !== null && i.productId !== i.plannedId

/** "+ Item não planeado": merges into an existing row for the same product, else a new bought row. */
export function addUnplanned(trip: Trip, p: PickedProduct, qty: number): Trip {
  const match = trip.items.find((i) => (p.productId ? i.productId === p.productId : same(i.name, p.name)))
  if (match) return patch(trip, match.key, (i) => ({ ...i, status: 'bought', qty: i.status === 'bought' ? i.qty + qty : qty }))
  return { items: [...trip.items, { key: newKey(), plannedId: null, plannedName: null, plannedUnit: null, plannedQty: null,
    productId: p.productId, name: p.name.trim(), unitWord: p.unitWord, qty, status: 'bought', urgent: false, unplanned: true }] }
}

export function tripCounts(trip: Trip) {
  const n = (s: TripStatus) => trip.items.filter((i) => i.status === s).length
  const bought = n('bought'), pending = n('pending'), skipped = n('skipped')
  return { bought, pending, skipped, progress: `${bought} de ${trip.items.length - skipped}` }
}

/** What the handoff carries into Slice 03 P1: the checked items only, with market quantities and empty costs. */
export const boughtItems = (trip: Trip) => trip.items.filter((i) => i.status === 'bought')
/** The list entries whose plan ended with this purchase (bought, or replaced by a substitute). */
export const endedPlanIds = (trip: Trip) => boughtItems(trip).flatMap((i) => (i.plannedId ? [i.plannedId] : []))
