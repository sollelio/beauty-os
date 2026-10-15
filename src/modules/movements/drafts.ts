// Movement drafts (ADR-0010 §3; Offline 6): an Adiantamento, Despesa or Compra filled in without a connection is kept
// on this device as a draft — never a financial record. It becomes one only through the existing online confirmation
// (live confirmer list, PIN, fresh one-shot grant) with its original capture time.
// Idempotency across sessions: the command id of a confirmation is stored in the draft *before* the command is sent,
// with a fingerprint of what is sent. A retry — even after closing the app — reuses it. Once a command was sent without
// a definite answer the draft is locked to that content (confirm it unchanged, or discard it), so an uncertain first
// attempt can never become a second, different record. A definite rejection (nothing was committed) unlocks it.
import { newCommandId } from '../../shared/commandId'
import { OfflineStorageError } from '../../shared/offline/errors'
import type { OfflineStore } from '../../shared/offline/store'
import type { Draft, JsonObject } from '../../shared/offline/types'
import type { MovementKind } from './snapshot'

// ---------- what a draft keeps (money in minor units; names only as capture already shows them) ----------
export type AdvanceForm = { person: { id: string; display_name: string; capabilities: string[] }; amountMinor: number; paymentMethodId: string; note: string | null }
export type ExpenseForm = {
  category: { id: string; label: string; hint: string | null }; amountMinor: number
  payments: { method_id: string; amount_minor: number }[]                // one part, or the two parts of Misto
  note: string | null
}
export type PurchaseLineForm = { key: string; productId: string | null; name: string; unitWord: string; quantity: number; costMinor: number; insteadOf: string | null }
export type PurchaseForm = {
  lines: PurchaseLineForm[]
  salonMinor: number | null                                              // null: the salon pays the rest (automatic)
  contributors: { personId: string; name: string; amountMinor: number }[]
  originId: string | null
  tripPlanIds: string[] | null                                           // started from Modo mercado: its plan entries
}
export type FormOf<K extends MovementKind> = K extends 'advance' ? AdvanceForm : K extends 'expense' ? ExpenseForm : PurchaseForm

export type DraftAttempt = { command_id: string; key: string; sent: boolean }
export type DraftReview = { code: string; at: string }
export type DraftPayload<K extends MovementKind = MovementKind> = {
  form: FormOf<K>
  display: { title: string; amount_minor: number }
  attempt: DraftAttempt | null
  review: DraftReview | null
}
export type MovementDraft<K extends MovementKind = MovementKind> = Omit<Draft, 'payload' | 'type'> & { type: K; payload: DraftPayload<K> }

export class DraftLockedError extends Error {
  constructor() { super('DRAFT_LOCKED') }
}

const asPayload = <K extends MovementKind>(d: Draft) => d.payload as unknown as DraftPayload<K>
const toJson = (p: DraftPayload) => p as unknown as JsonObject
const now = () => new Date().toISOString()

export async function readDraft<K extends MovementKind>(store: OfflineStore, draftId: string, kind?: K): Promise<MovementDraft<K> | null> {
  const d = await store.drafts.get(draftId)
  if (!d || (kind && d.type !== kind)) return null
  return { ...d, type: d.type as K, payload: asPayload<K>(d) }
}

/**
 * Saves a new draft (its capture time is now) or updates one: the capture time never changes. Editing clears an
 * earlier review mark; a draft whose last confirmation was sent without an answer cannot be edited.
 */
export async function saveDraft<K extends MovementKind>(store: OfflineStore, kind: K, form: FormOf<K>, display: DraftPayload['display'],
  draftId: string | null = null): Promise<MovementDraft<K>> {
  const existing = draftId ? await readDraft(store, draftId, kind) : null
  if (draftId && !existing) throw new OfflineStorageError('NOT_FOUND', 'this draft no longer exists')
  if (existing?.payload.attempt?.sent) throw new DraftLockedError()
  const payload: DraftPayload<K> = { form, display, attempt: null, review: null }
  const saved = await store.drafts.put({
    draftId: existing?.draftId ?? crypto.randomUUID(), type: kind, capturedAt: existing?.capturedAt ?? now(), payload: toJson(payload as DraftPayload),
  })
  return { ...saved, type: kind, payload }
}

async function update<K extends MovementKind>(store: OfflineStore, draftId: string, change: (p: DraftPayload<K>) => DraftPayload<K>, state?: 'submitted') {
  const d = await readDraft<K>(store, draftId)
  if (!d) throw new OfflineStorageError('NOT_FOUND', 'this draft no longer exists')
  await store.drafts.put({ draftId, type: d.type, capturedAt: d.capturedAt, state: state ?? d.state, payload: toJson(change(d.payload) as DraftPayload) })
}

/** The command id for confirming this content: the stored one when the content is the same, else a new one. */
export async function beginAttempt(store: OfflineStore, draftId: string, key: string): Promise<string> {
  const d = await readDraft(store, draftId)
  if (!d) throw new OfflineStorageError('NOT_FOUND', 'this draft no longer exists')
  const a = d.payload.attempt
  if (a && a.key === key) return a.command_id
  if (a?.sent) throw new DraftLockedError()
  const attempt: DraftAttempt = { command_id: newCommandId(), key, sent: false }
  await update(store, draftId, (p) => ({ ...p, attempt }))
  return attempt.command_id
}
/** Recorded before the request leaves: from now on the outcome may be uncertain. */
export const markSent = (store: OfflineStore, draftId: string) =>
  update(store, draftId, (p) => ({ ...p, attempt: p.attempt && { ...p.attempt, sent: true } }))
/** The server acknowledged: the draft is now a record. */
export const markSubmitted = (store: OfflineStore, draftId: string) =>
  update(store, draftId, (p) => ({ ...p, review: null }), 'submitted')
/** A definite rejection: nothing was committed, the content may be edited again (except an idempotency conflict). */
export const markRejected = (store: OfflineStore, draftId: string, code: string) =>
  update(store, draftId, (p) => ({ ...p, review: { code, at: now() }, attempt: code === 'IDEMPOTENCY_CONFLICT' ? p.attempt : null }))
/** The grant was no longer valid: nothing was committed, the same command id is used again after re-verification. */
export const markNotSent = (store: OfflineStore, draftId: string) =>
  update(store, draftId, (p) => ({ ...p, attempt: p.attempt && { ...p.attempt, sent: false } }))

/** Draft review codes after which the same draft must not be confirmed again (it would be refused again, or could
 *  duplicate something the server kept): it can only be discarded, or entered again as a new movement. */
export const BLOCKING_DRAFT_REVIEWS = new Set(['PERIOD_APPROVED', 'PERIOD_CLOSED', 'CAPTURE_TIME_TOO_OLD', 'CAPTURE_TIME_IN_FUTURE', 'IDEMPOTENCY_CONFLICT', 'NOT_AUTHORIZED'])
export const isBlockedDraft = (d: MovementDraft | null) => !!d?.payload.review && BLOCKING_DRAFT_REVIEWS.has(d.payload.review.code)

/**
 * "Registar como novo" (Offline 7): a clearly new intent — a new draft with the same content, a new capture time (now)
 * and no command id yet — while the old draft is discarded. Never for an idempotency conflict (it may exist already).
 */
export async function reenterDraft<K extends MovementKind>(store: OfflineStore, draft: MovementDraft<K>): Promise<MovementDraft<K>> {
  if (draft.payload.review?.code === 'IDEMPOTENCY_CONFLICT') throw new DraftLockedError()
  const fresh = await saveDraft(store, draft.type, draft.payload.form, draft.payload.display)
  await store.drafts.delete(draft.draftId)
  return fresh
}

/** Explicit, confirmed by the person: removes only this device's draft; the server is never involved. */
export const discardDraft = (store: OfflineStore, draftId: string) => store.drafts.delete(draftId)

export type DraftSummary = {
  draftId: string; type: MovementKind; capturedAt: string; title: string; amountMinor: number
  review: DraftReview | null; locked: boolean
}
/** The drafts waiting for a PIN confirmation, oldest first: identification only. */
export async function listPendingDrafts(store: OfflineStore): Promise<DraftSummary[]> {
  return (await store.drafts.list()).filter((d) => d.state === 'draft').map((d) => {
    const p = asPayload(d)
    return { draftId: d.draftId, type: d.type, capturedAt: d.capturedAt, title: p.display.title, amountMinor: p.display.amount_minor,
      review: p.review, locked: !!p.attempt?.sent }
  }).sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : 1))
}
