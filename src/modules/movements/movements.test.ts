// Offline 6 · movement snapshot and drafts: public lists only, 48-hour freshness, drafts that keep their capture time,
// and a stored command id that makes an uncertain confirmation impossible to duplicate.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../shared/supabase/client', () => ({ getSupabase: vi.fn(() => { throw new Error('no backend in these tests') }), authStorageKey: () => 'k' }))
import { openOfflineDb } from '../../shared/offline/db'
import { createOfflineStore, type OfflineStore } from '../../shared/offline/store'
import { writeCaptureSnapshot } from '../services/offline'
import {
  beginAttempt, discardDraft, DraftLockedError, listPendingDrafts, markNotSent, markRejected, markSent, markSubmitted, readDraft, saveDraft,
  type AdvanceForm, type PurchaseForm,
} from './drafts'
import { readMovementSnapshot, writeMovementSnapshot } from './snapshot'

const ORG = '00000000-0000-4000-8000-0000000000f6', USER = '11111111-1111-4111-8111-111111111111'
const id = () => crypto.randomUUID()
const P1 = id(), M1 = id(), C1 = id(), O1 = id(), PR1 = id()
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
let store: OfflineStore
beforeEach(async () => { store = createOfflineStore(await openOfflineDb({ factory: new IDBFactory() }), { organizationId: ORG, deviceUserId: USER }) })

async function seedAll(at = hoursAgo(1)) {
  await writeCaptureSnapshot(store, { people: [{ id: P1, display_name: 'Ana', capabilities: ['Cabelo'] }], services: [], paymentMethods: [{ id: M1, code: 'numerario', label: 'Numerário' }] }, at)
  await writeMovementSnapshot(store, {
    expenseCategories: [{ id: C1, label: 'Água', hint: null, earned_minor: 9 } as never],
    purchaseOrigins: [{ id: O1, label: 'Mercado' }],
    products: [{ id: PR1, name: 'Acetona', unit_word: 'frasco', reserve_units: 3, reference_price_minor: 100 } as never],
    unitWords: ['unid.', 'frasco'],
    purchasePeople: [{ id: P1, display_name: 'Ana' }],
  }, at)
}

describe('movement snapshot', () => {
  it('each movement reads exactly its groups, with public fields only', async () => {
    await seedAll()
    expect((await readMovementSnapshot(store, 'advance')).data).toEqual({ people: [{ id: P1, display_name: 'Ana', capabilities: ['Cabelo'] }], paymentMethods: [{ id: M1, code: 'numerario', label: 'Numerário' }] })
    expect((await readMovementSnapshot(store, 'expense')).data).toEqual({ expenseCategories: [{ id: C1, label: 'Água', hint: null }], paymentMethods: [{ id: M1, code: 'numerario', label: 'Numerário' }] })
    const purchase = await readMovementSnapshot(store, 'purchase')
    expect(purchase).toEqual({ state: 'ok', data: {
      products: [{ id: PR1, name: 'Acetona', unit_word: 'frasco' }], unitWords: ['unid.', 'frasco'],
      purchaseOrigins: [{ id: O1, label: 'Mercado' }], purchasePeople: [{ id: P1, display_name: 'Ana' }] } })
    expect(JSON.stringify(await store.snapshot.listMeta())).not.toMatch(/earned|reference_price|reserve/)
  })
  it('a missing group, or one older than 48 hours, blocks a new draft', async () => {
    expect((await readMovementSnapshot(store, 'expense')).state).toBe('missing')
    await seedAll(hoursAgo(49))
    expect((await readMovementSnapshot(store, 'advance')).state).toBe('stale')
    expect((await readMovementSnapshot(store, 'purchase')).state).toBe('stale')
    await seedAll(hoursAgo(47))
    expect((await readMovementSnapshot(store, 'expense')).state).toBe('ok')
    await writeMovementSnapshot(store, { expenseCategories: [] })
    expect((await readMovementSnapshot(store, 'expense')).state).toBe('missing')        // nothing to choose from
  })
})

const advance = (amountMinor = 1000000): AdvanceForm => ({ person: { id: P1, display_name: 'Ana', capabilities: ['Cabelo'] }, amountMinor, paymentMethodId: M1, note: null })
const display = { title: 'Ana', amount_minor: 1000000 }

describe('drafts', () => {
  it('a draft keeps its capture time when edited; editing clears an earlier review', async () => {
    const d = await saveDraft(store, 'advance', advance(), display)
    expect(d).toMatchObject({ type: 'advance', state: 'draft' })
    await markRejected(store, d.draftId, 'PERSON_INACTIVE')
    await new Promise((r) => setTimeout(r, 5))
    const edited = await saveDraft(store, 'advance', advance(2000000), { ...display, amount_minor: 2000000 }, d.draftId)
    expect(edited.capturedAt).toBe(d.capturedAt)
    expect(edited.payload.review).toBeNull()
    expect((await readDraft(store, d.draftId, 'advance'))?.payload.form.amountMinor).toBe(2000000)
    expect(await store.drafts.list()).toHaveLength(1)
  })
  it('the same content reuses its command id; a stored, unanswered attempt locks the content', async () => {
    const d = await saveDraft(store, 'advance', advance(), display)
    const a = await beginAttempt(store, d.draftId, 'k1')
    expect(await beginAttempt(store, d.draftId, 'k1')).toBe(a)
    expect(await beginAttempt(store, d.draftId, 'k2')).not.toBe(a)                         // not sent yet: a new content is fine
    const b = await beginAttempt(store, d.draftId, 'k3')
    await markSent(store, d.draftId)
    expect(await beginAttempt(store, d.draftId, 'k3')).toBe(b)                              // after a restart: the same id
    await expect(beginAttempt(store, d.draftId, 'k4')).rejects.toBeInstanceOf(DraftLockedError)
    await expect(saveDraft(store, 'advance', advance(5), display, d.draftId)).rejects.toBeInstanceOf(DraftLockedError)
    await markNotSent(store, d.draftId)                                                     // the grant was refused: nothing committed
    expect(await beginAttempt(store, d.draftId, 'k3')).toBe(b)
  })
  it('a definite rejection keeps the draft for review and unlocks it; an idempotency conflict stays locked', async () => {
    const d = await saveDraft(store, 'advance', advance(), display)
    await beginAttempt(store, d.draftId, 'k1'); await markSent(store, d.draftId)
    await markRejected(store, d.draftId, 'PERIOD_APPROVED')
    expect((await readDraft(store, d.draftId))!.payload).toMatchObject({ review: { code: 'PERIOD_APPROVED' }, attempt: null })
    expect((await readDraft(store, d.draftId))!.state).toBe('draft')
    const e = await saveDraft(store, 'advance', advance(), display)
    await beginAttempt(store, e.draftId, 'k1'); await markSent(store, e.draftId)
    await markRejected(store, e.draftId, 'IDEMPOTENCY_CONFLICT')
    expect((await readDraft(store, e.draftId))!.payload.attempt?.sent).toBe(true)
  })
  it('acknowledged: submitted, out of the pending list', async () => {
    const d = await saveDraft(store, 'advance', advance(), display)
    const keep = await saveDraft(store, 'expense', { category: { id: C1, label: 'Água', hint: null }, amountMinor: 50000, payments: [{ method_id: M1, amount_minor: 50000 }], note: null }, { title: 'Água', amount_minor: 50000 })
    await markSubmitted(store, d.draftId)
    expect((await readDraft(store, d.draftId))!.state).toBe('submitted')
    expect((await listPendingDrafts(store)).map((x) => x.draftId)).toEqual([keep.draftId])
    expect(await store.drafts.countPending()).toBe(1)
  })
  it('discard removes only that local draft', async () => {
    const a = await saveDraft(store, 'advance', advance(), display)
    const b = await saveDraft(store, 'advance', advance(3), display)
    await discardDraft(store, a.draftId)
    expect(await readDraft(store, a.draftId)).toBeNull()
    expect(await readDraft(store, b.draftId)).not.toBeNull()
  })
  it('a purchase draft keeps lines, contributors, origin and the trip plan in minor units', async () => {
    const form: PurchaseForm = {
      lines: [{ key: 'l1', productId: PR1, name: 'Acetona', unitWord: 'frasco', quantity: 2, costMinor: 450000, insteadOf: null },
        { key: 'l2', productId: null, name: 'Algodão', unitWord: 'unid.', quantity: 1, costMinor: 50000, insteadOf: 'Discos' }],
      salonMinor: 300000, contributors: [{ personId: P1, name: 'Ana', amountMinor: 200000 }], originId: O1, tripPlanIds: [PR1],
    }
    const d = await saveDraft(store, 'purchase', form, { title: '2 produtos', amount_minor: 500000 })
    expect((await readDraft(store, d.draftId, 'purchase'))!.payload.form).toEqual(form)
  })
  it('a draft never holds a PIN, a grant or private-session state', async () => {
    for (const bad of [{ ...advance(), pin: '135790' }, { ...advance(), grantId: id() }, { ...advance(), privateSession: true }]) {
      await expect(saveDraft(store, 'advance', bad as AdvanceForm, display)).rejects.toMatchObject({ code: 'FORBIDDEN_FIELD' })
    }
    expect(await store.drafts.list()).toEqual([])
  })
})
