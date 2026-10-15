// The last-known operational binding (ADR-0010 §6; Offline 4): which organization this device principal was bound to
// the last time the server said so, and that organization's public display data (name, time zone, currency). It lets
// an offline start choose the right partition and open the approved public offline capture — nothing else.
// It is NOT authorization: the server checks the device principal on every synchronized command, and a server answer
// that the device is no longer bound removes it. It never holds permissions, private-session state, PINs or grants.
import { BINDING_STORE, promised, transact } from './db'
import { OfflineStorageError } from './errors'
import { assertIso, assertSafeObject, assertUuid, isIsoInstant, isUuid } from './validate'

export type PublicOrganization = {
  id: string; name: string; timezone: string
  currency_code: string; currency_exponent: number; currency_symbol: string
}
export type CachedBinding = { deviceUserId: string; organization: PublicOrganization; verifiedAt: string }

const malformed = (m: string) => new OfflineStorageError('MALFORMED_RECORD', m)
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max

function checkOrganization(o: unknown): PublicOrganization {
  const x = o as PublicOrganization
  if (!x || !isUuid(x.id) || !text(x.name, 120) || !text(x.timezone, 64) || !text(x.currency_code, 8) || !text(x.currency_symbol, 8)
      || !Number.isSafeInteger(x.currency_exponent) || x.currency_exponent < 0 || x.currency_exponent > 4) {
    throw malformed('binding organization does not match its contract')
  }
  // exactly the public fields: nothing else from the device context is kept
  return { id: x.id, name: x.name, timezone: x.timezone, currency_code: x.currency_code, currency_exponent: x.currency_exponent, currency_symbol: x.currency_symbol }
}

export async function saveBinding(db: IDBDatabase, binding: CachedBinding): Promise<CachedBinding> {
  const record: CachedBinding = {
    deviceUserId: assertUuid('deviceUserId', binding.deviceUserId),
    organization: checkOrganization(binding.organization),
    verifiedAt: assertIso('verifiedAt', binding.verifiedAt),
  }
  assertSafeObject(record, 'binding')
  return transact(db, [BINDING_STORE], 'readwrite', async (tx) => { await promised(tx.objectStore(BINDING_STORE).put(record)); return record })
}

/** The binding of this principal, or null (none, or not readable as one). */
export async function readBinding(db: IDBDatabase, deviceUserId: string): Promise<CachedBinding | null> {
  if (!isUuid(deviceUserId)) return null
  const r = (await transact(db, [BINDING_STORE], 'readonly', (tx) => promised(tx.objectStore(BINDING_STORE).get(deviceUserId)))) as CachedBinding | undefined
  if (!r || r.deviceUserId !== deviceUserId || !isIsoInstant(r.verifiedAt)) return null
  try { return { deviceUserId, organization: checkOrganization(r.organization), verifiedAt: r.verifiedAt } } catch { return null }
}

export async function deleteBinding(db: IDBDatabase, deviceUserId: string): Promise<void> {
  if (!isUuid(deviceUserId)) return
  await transact(db, [BINDING_STORE], 'readwrite', async (tx) => { await promised(tx.objectStore(BINDING_STORE).delete(deviceUserId)) })
}
