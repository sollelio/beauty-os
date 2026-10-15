// Registar serviço offline (ADR-0010 §1, §9; Offline 4): the public capture snapshot, the outbox entry for a service
// captured without a connection, and the drainer that replays queued services when the server is reachable.
// Only record_service is ever queued or sent from here. Movements are never queued (they need the online PIN).
import { getDeviceContext, getSessionPrincipal } from '../org/api'
import { listServices, type CatalogueService } from '../catalogue/api'
import { toAppError } from '../../shared/errors'
import type { Drainer, DrainResult } from '../../shared/offline/coordinator'
import type { OfflineStore } from '../../shared/offline/store'
import type { JsonObject, OutboxItem } from '../../shared/offline/types'
import { isIsoInstant, isUuid } from '../../shared/offline/validate'
import {
  listCapturePeople, listPaymentMethods, submitQueuedService,
  type CapturePerson, type PaymentMethod, type QueuedServicePayload, type RecordServiceInput, type RecordServiceResult,
} from './api'

// ---------- snapshot ----------
export const CAPTURE_SNAPSHOT_VERSION = 1
/** The offline window (ADR-0010 §2): salon data older than this is not used for a new offline service. */
export const CAPTURE_SNAPSHOT_MAX_AGE_MS = 48 * 60 * 60 * 1000

export type CaptureData = { people: CapturePerson[]; services: CatalogueService[]; paymentMethods: PaymentMethod[] }
export type CaptureSnapshot = CaptureData & { fetchedAt: string }     // fetchedAt: the oldest of the three groups
export type CaptureSnapshotState = 'ok' | 'missing' | 'stale'

// exactly the public fields each list needs — nothing else from the server rows is kept
const person = (p: CapturePerson) => ({ id: p.id, display_name: p.display_name, capabilities: [...p.capabilities] })
const service = (s: CatalogueService) => ({ id: s.id, name: s.name, default_price_minor: s.default_price_minor })
const method = (m: PaymentMethod) => ({ id: m.id, code: m.code, label: m.label })

export async function writeCaptureSnapshot(store: OfflineStore, data: CaptureData, fetchedAt = new Date().toISOString()): Promise<void> {
  const v = { version: CAPTURE_SNAPSHOT_VERSION, fetchedAt }
  await store.snapshot.replace('people', { ...v, data: data.people.map(person) })
  await store.snapshot.replace('services', { ...v, data: data.services.map(service) })
  await store.snapshot.replace('paymentMethods', { ...v, data: data.paymentMethods.map(method) })
}

/** After a successful online load: fetch the three capture lists and keep them for offline capture. */
export async function refreshCaptureSnapshot(store: OfflineStore): Promise<void> {
  const [people, services, paymentMethods] = await Promise.all([listCapturePeople(), listServices(), listPaymentMethods()])
  await writeCaptureSnapshot(store, { people, services, paymentMethods })
}

const isText = (v: unknown) => typeof v === 'string' && v.length > 0
const validPerson = (x: CapturePerson) => isUuid(x?.id) && isText(x.display_name) && Array.isArray(x.capabilities) && x.capabilities.every(isText)
const validService = (x: CatalogueService) => isUuid(x?.id) && isText(x.name) && Number.isSafeInteger(x.default_price_minor) && x.default_price_minor >= 0
const validMethod = (x: PaymentMethod) => isUuid(x?.id) && isText(x.code) && isText(x.label)

export async function readCaptureSnapshot(store: OfflineStore): Promise<CaptureSnapshot | null> {
  const [p, s, m] = await Promise.all([store.snapshot.get('people'), store.snapshot.get('services'), store.snapshot.get('paymentMethods')])
  if (!p || !s || !m || [p, s, m].some((g) => g.version !== CAPTURE_SNAPSHOT_VERSION || !Array.isArray(g.data))) return null
  const people = p.data as unknown as CapturePerson[], services = s.data as unknown as CatalogueService[], paymentMethods = m.data as unknown as PaymentMethod[]
  if (!people.every(validPerson) || !services.every(validService) || !paymentMethods.every(validMethod)) return null
  const fetchedAt = [p.fetchedAt, s.fetchedAt, m.fetchedAt].sort()[0]!
  return { people, services, paymentMethods, fetchedAt }
}

export function captureSnapshotState(snap: CaptureSnapshot | null, now = Date.now()): CaptureSnapshotState {
  if (!snap || snap.people.length === 0 || snap.services.length === 0 || snap.paymentMethods.length === 0) return 'missing'
  return now - Date.parse(snap.fetchedAt) <= CAPTURE_SNAPSHOT_MAX_AGE_MS ? 'ok' : 'stale'
}

// ---------- outbox ----------
export function toQueuedPayload(input: RecordServiceInput): QueuedServicePayload {
  return {
    p_person_id: input.personId, p_service_id: input.serviceId, p_value_minor: input.valueMinor,
    p_payments: input.payments.map((x) => ({ method_id: x.method_id, amount_minor: x.amount_minor })),
  }
}

/** Stores the service captured offline as one outbox item (state local). Same command id + content: a no-op. */
export async function queueService(store: OfflineStore, commandId: string, input: RecordServiceInput, occurredAt: string): Promise<OutboxItem> {
  return store.outbox.put({ commandId, type: 'record_service', payload: toQueuedPayload(input) as unknown as JsonObject, occurredAt })
}

/** The stored payload, exactly the four record_service arguments — anything else is not sent. */
export function readQueuedPayload(payload: JsonObject): QueuedServicePayload | null {
  const keys = Object.keys(payload).sort().join(',')
  const x = payload as unknown as QueuedServicePayload
  if (keys !== 'p_payments,p_person_id,p_service_id,p_value_minor' || !isUuid(x.p_person_id) || !isUuid(x.p_service_id)
      || !Number.isSafeInteger(x.p_value_minor) || !Array.isArray(x.p_payments)
      || !x.p_payments.every((p) => isUuid(p?.method_id) && Number.isSafeInteger(p.amount_minor) && Object.keys(p).length === 2)) {
    return null
  }
  return x
}

// ---------- drain ----------
const SENDABLE = new Set(['local', 'syncing', 'failed'])     // syncing: a previous cycle stopped before the answer
const RETRY_AFTER_MS = 60_000

export type ServiceDrainDeps = {
  deviceContext: typeof getDeviceContext
  sessionPrincipal: typeof getSessionPrincipal
  submit: (commandId: string, payload: QueuedServicePayload, occurredAt: string) => Promise<RecordServiceResult>
  now: () => Date
}

/**
 * Sends queued services one at a time, oldest first, with their original command id and captured time; an item is
 * synced only after the server's answer. First the server must still recognise this device for the partition's
 * organization and the session must still be the partition's principal — otherwise nothing is sent and the items stay.
 * A transient failure (network, unexpected) marks the item failed and stops; a domain or security rejection marks it
 * conflict (never retried blindly) and goes on — except NOT_AUTHORIZED, which stops.
 */
export function createServiceDrainer(deps: ServiceDrainDeps = { deviceContext: getDeviceContext, sessionPrincipal: getSessionPrincipal, submit: submitQueuedService, now: () => new Date() }): Drainer {
  return async (store, signal) => {
    const result: DrainResult = { synced: 0, failed: 0, conflicts: 0 }
    // oldest first: by captured time, then by when it was stored on this device
    const items = (await store.outbox.list()).filter((i) => i.type === 'record_service' && SENDABLE.has(i.state))
      .sort((x, y) => (x.occurredAt === y.occurredAt ? (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : 0) : x.occurredAt < y.occurredAt ? -1 : 1))
    if (items.length === 0) return result
    try {
      const ctx = await deps.deviceContext()
      if (!ctx.bound) return { ...result, stopped: 'unbound' }
      if (ctx.organization.id !== store.partition.organizationId) return { ...result, stopped: 'principal_changed' }
      if ((await deps.sessionPrincipal()) !== store.partition.deviceUserId) return { ...result, stopped: 'principal_changed' }
    } catch {
      return { ...result, stopped: 'network' }
    }
    for (const item of items) {
      if (signal.aborted) break
      const payload = readQueuedPayload(item.payload)
      if (!payload || !isIsoInstant(item.occurredAt)) {
        await store.outbox.updateState(item.commandId, { state: 'conflict', lastError: 'MALFORMED_PAYLOAD' })
        result.conflicts++
        continue
      }
      await store.outbox.updateState(item.commandId, { state: 'syncing', attempts: item.attempts + 1 })
      try {
        const ack = await deps.submit(item.commandId, payload, item.occurredAt)
        await store.outbox.updateState(item.commandId, {
          state: 'synced', lastError: null, nextAttemptAt: null,
          ack: { record_id: ack.record_id, occurred_at: ack.occurred_at, replayed: ack.replayed === true },
        })
        result.synced++
      } catch (e) {
        const err = toAppError(e)
        if (err.kind === 'domain') {
          await store.outbox.updateState(item.commandId, { state: 'conflict', lastError: err.code ?? 'DOMAIN' })
          result.conflicts++
          if (err.code === 'NOT_AUTHORIZED') { result.stopped = 'unbound'; break }
          continue
        }
        await store.outbox.updateState(item.commandId, {
          state: 'failed', lastError: err.kind === 'network' ? 'network' : 'unexpected',
          nextAttemptAt: new Date(deps.now().getTime() + RETRY_AFTER_MS).toISOString(),
        })
        result.failed++
        result.stopped = 'network'
        break
      }
    }
    if (result.synced > 0) await store.meta.set('lastSuccessfulSyncAt', deps.now().toISOString())
    return result
  }
}

/** The app's drainer (module-level, so the runtime's coordinator is not recreated on every render). */
export const serviceDrainer = createServiceDrainer()

// ---------- review (Offline 7): queued services the server did not accept ----------
// No retry of the same command: nothing on this phone can prove an inactive reference is active again, so a refused
// service is registered again (a new intent, through the current flow) or discarded.
/** Codes after which it is not certain the server did not keep something: discarding needs a stronger warning. */
export const UNCERTAIN_SERVICE_CONFLICTS = new Set(['IDEMPOTENCY_CONFLICT', 'NOT_AUTHORIZED'])

export type ServiceConflict = { commandId: string; code: string; occurredAt: string; valueMinor: number | null; personId: string | null; serviceId: string | null }
export async function listServiceConflicts(store: OfflineStore): Promise<ServiceConflict[]> {
  return (await store.outbox.listByState('conflict')).filter((i) => i.type === 'record_service').map((i) => {
    const p = readQueuedPayload(i.payload)
    return { commandId: i.commandId, code: i.lastError ?? 'UNKNOWN', occurredAt: i.occurredAt, valueMinor: p?.p_value_minor ?? null,
      personId: p?.p_person_id ?? null, serviceId: p?.p_service_id ?? null }
  })
}
/** Explicit, confirmed by a person: removes the item from this phone only; nothing is created or deleted on the server. */
export async function discardServiceItem(store: OfflineStore, commandId: string): Promise<void> {
  const item = await store.outbox.get(commandId)
  if (item && item.state !== 'synced' && item.state !== 'conflict' && item.state !== 'failed') throw new Error('NOT_IN_REVIEW')
  await store.outbox.delete(commandId)
}

