// The public lists the movement drafts need offline (ADR-0010 §1, §3; Offline 6), kept beside the Registar serviço
// snapshot: expense categories, purchase origins, active products, unit words and the people who may contribute to a
// purchase. Adiantamento reuses the service snapshot's people and payment methods. Only public operational fields;
// each group is dated, and a draft can be started only from groups at most 48 hours old.
import { listPeople, type PersonRow } from '../org/api'
import { listExpenseCategories, type ExpenseCategory } from '../money/api'
import { listPurchaseOrigins, type PurchaseOrigin } from '../purchasing/api'
import { listProducts, listUnitWords, type Product } from '../stock/api'
import { CAPTURE_SNAPSHOT_MAX_AGE_MS, CAPTURE_SNAPSHOT_VERSION } from '../services/offline'
import type { CapturePerson, PaymentMethod } from '../services/api'
import type { OfflineStore } from '../../shared/offline/store'
import type { SnapshotGroup } from '../../shared/offline/types'
import { isUuid } from '../../shared/offline/validate'

export type MovementKind = 'advance' | 'expense' | 'purchase'
export type MovementData = {
  people: CapturePerson[]; paymentMethods: PaymentMethod[]
  expenseCategories: ExpenseCategory[]
  products: Product[]; unitWords: string[]; purchaseOrigins: PurchaseOrigin[]; purchasePeople: PersonRow[]
}
export type MovementSnapshotState = 'ok' | 'missing' | 'stale'

/** The groups each movement needs, and those that must not be empty for a draft to make sense. */
export const MOVEMENT_GROUPS: Record<MovementKind, { groups: SnapshotGroup[]; nonEmpty: SnapshotGroup[] }> = {
  advance: { groups: ['people', 'paymentMethods'], nonEmpty: ['people', 'paymentMethods'] },
  expense: { groups: ['expenseCategories', 'paymentMethods'], nonEmpty: ['expenseCategories', 'paymentMethods'] },
  purchase: { groups: ['products', 'unitWords', 'purchaseOrigins', 'purchasePeople'], nonEmpty: ['unitWords'] },
}

const text = (v: unknown) => typeof v === 'string' && v.length > 0
const PICK: Record<'expenseCategories' | 'purchaseOrigins' | 'products' | 'unitWords' | 'purchasePeople', (x: never) => unknown> = {
  expenseCategories: (c: ExpenseCategory) => ({ id: c.id, label: c.label, hint: c.hint ?? null }),
  purchaseOrigins: (o: PurchaseOrigin) => ({ id: o.id, label: o.label }),
  products: (p: Product) => ({ id: p.id, name: p.name, unit_word: p.unit_word }),
  unitWords: (w: string) => w,
  purchasePeople: (p: PersonRow) => ({ id: p.id, display_name: p.display_name }),
}
const VALID: Record<SnapshotGroup, (x: never) => boolean> = {
  people: (p: CapturePerson) => isUuid(p?.id) && text(p.display_name) && Array.isArray(p.capabilities),
  paymentMethods: (m: PaymentMethod) => isUuid(m?.id) && text(m.code) && text(m.label),
  expenseCategories: (c: ExpenseCategory) => isUuid(c?.id) && text(c.label) && (c.hint === null || typeof c.hint === 'string'),
  purchaseOrigins: (o: PurchaseOrigin) => isUuid(o?.id) && text(o.label),
  products: (p: Product) => isUuid(p?.id) && text(p.name) && text(p.unit_word),
  unitWords: (w: string) => text(w),
  purchasePeople: (p: PersonRow) => isUuid(p?.id) && text(p.display_name),
  services: () => true, hojeSummary: () => true,
}

type OwnGroups = Pick<MovementData, 'expenseCategories' | 'purchaseOrigins' | 'products' | 'unitWords' | 'purchasePeople'>
/** Replaces the given groups (each in one write), keeping exactly their public fields. */
export async function writeMovementSnapshot(store: OfflineStore, data: Partial<OwnGroups>, fetchedAt = new Date().toISOString()): Promise<void> {
  for (const group of ['expenseCategories', 'purchaseOrigins', 'products', 'unitWords', 'purchasePeople'] as const) {
    if (!data[group]) continue
    const pick = PICK[group] as (x: unknown) => unknown
    await store.snapshot.replace(group, { version: CAPTURE_SNAPSHOT_VERSION, fetchedAt, data: (data[group]! as unknown[]).map(pick) as never })
  }
}

/** After a successful online load (app start, reconnect): the movement lists for offline drafts. */
export async function refreshMovementSnapshot(store: OfflineStore): Promise<void> {
  const [expenseCategories, purchaseOrigins, products, unitWords, purchasePeople] =
    await Promise.all([listExpenseCategories(), listPurchaseOrigins(), listProducts(), listUnitWords(), listPeople()])
  await writeMovementSnapshot(store, { expenseCategories, purchaseOrigins, products, unitWords, purchasePeople })
}

/** The groups one movement needs from the device, with whether they can be used now. */
export async function readMovementSnapshot(store: OfflineStore, kind: MovementKind, now = Date.now()): Promise<{ state: MovementSnapshotState; data: Partial<MovementData> }> {
  const { groups, nonEmpty } = MOVEMENT_GROUPS[kind]
  const data: Partial<Record<SnapshotGroup, unknown[]>> = {}
  let oldest = Infinity
  for (const g of groups) {
    const rec = await store.snapshot.get(g)
    if (!rec || rec.version !== CAPTURE_SNAPSHOT_VERSION || !Array.isArray(rec.data) || !(rec.data as never[]).every(VALID[g])) return { state: 'missing', data: {} }
    if (nonEmpty.includes(g) && rec.data.length === 0) return { state: 'missing', data: {} }
    data[g] = rec.data as unknown[]
    oldest = Math.min(oldest, Date.parse(rec.fetchedAt))
  }
  return { state: now - oldest <= CAPTURE_SNAPSHOT_MAX_AGE_MS ? 'ok' : 'stale', data: data as Partial<MovementData> }
}
