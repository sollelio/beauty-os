// Boundary checks for everything written to (and read back from) local storage.
import { OfflineStorageError } from './errors'
import type { JsonObject, JsonValue, Partition } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_DEPTH = 16

const malformed = (message: string) => new OfflineStorageError('MALFORMED_RECORD', message)

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

/** One canonical time representation: the ISO-8601 UTC string Date#toISOString produces. */
export const isIsoInstant = (v: unknown): v is string =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v

export function assertPartition(p: Partition): Partition {
  if (!p || !isUuid(p.organizationId) || !isUuid(p.deviceUserId)) throw malformed('partition needs an organization id and a device user id')
  return { organizationId: p.organizationId, deviceUserId: p.deviceUserId }
}
export function assertUuid(name: string, v: unknown): string {
  if (!isUuid(v)) throw malformed(`${name} must be a uuid`)
  return v
}
export function assertIso(name: string, v: unknown): string {
  if (!isIsoInstant(v)) throw malformed(`${name} must be an ISO-8601 UTC time (toISOString)`)
  return v
}
export function assertOneOf<T extends string>(name: string, v: unknown, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw malformed(`${name} must be one of ${allowed.join(', ')}`)
  return v as T
}

// Names of secrets and of private data that must never reach device storage (ADR-0010 §4): PINs and anything derived
// from them, grant ids, private-session state, private finance (Fecho, Situação, Negócio, reserve, position). Matched
// word by word in any naming style (p_grant_id, grantId, PIN, pinHash, private_session…). "reserve" alone is Stock
// Lite's spare units (public); with a money or allocation word it is the salon's financial reserve. A guard against
// mistakes, not a proof: payloads are still built from approved fields only.
const FORBIDDEN_WORDS = new Set([
  'pin', 'pins', 'secret', 'secrets', 'grant', 'grants', 'password', 'passcode', 'token', 'tokens',
  'private', 'fecho', 'situacao', 'situation', 'negocio', 'position', 'positions',
  'earned', 'earnings', 'payable', 'remuneration',
])
const RESERVE_MONEY_WORDS = new Set(['minor', 'balance', 'allocation', 'allocations', 'allocated', 'use', 'uses', 'used'])
export const fieldWords = (key: string) =>
  key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
export const isForbiddenField = (key: string) => {
  const words = fieldWords(key)
  return words.some((w) => FORBIDDEN_WORDS.has(w))
    || (words.some((w) => w === 'reserve' || w === 'reserves') && words.some((w) => RESERVE_MONEY_WORDS.has(w)))
}

const isPlainObject = (v: object) => {
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/**
 * JSON-shaped, structured-clone-safe data only: null, strings, booleans, finite numbers, arrays and plain objects.
 * Rejects undefined, BigInt, functions, Dates and other class instances (times are ISO strings), forbidden field
 * names, and money fields (`…_minor` / `…Minor`) that are not safe integers.
 */
export function assertSafeData(value: unknown, path = 'payload', depth = 0): JsonValue {
  if (depth > MAX_DEPTH) throw malformed(`${path} is nested too deeply`)
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw malformed(`${path} must be a finite number`)
    return value
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertSafeData(v, `${path}[${i}]`, depth + 1))
    return value as JsonValue[]
  }
  if (typeof value === 'object' && isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (isForbiddenField(k)) throw new OfflineStorageError('FORBIDDEN_FIELD', `${path}.${k} may not be stored on the device`)
      const words = fieldWords(k)
      if (words[words.length - 1] === 'minor' && v !== null && !Number.isSafeInteger(v)) throw malformed(`${path}.${k} must be an integer amount in minor units`)
      assertSafeData(v, `${path}.${k}`, depth + 1)
    }
    return value as JsonObject
  }
  throw malformed(`${path} holds a ${typeof value === 'object' ? (value as object).constructor?.name ?? 'non-plain object' : typeof value}, not plain data`)
}

export function assertSafeObject(value: unknown, path: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw malformed(`${path} must be an object`)
  return assertSafeData(value, path) as JsonObject
}

/** Order-independent comparison of JSON data (object key order does not matter). */
export function sameData(a: JsonValue, b: JsonValue): boolean {
  return canonical(a) === canonical(b)
}
function canonical(v: JsonValue): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v !== null && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k]!)}`).join(',')}}`
  return JSON.stringify(v)
}

/** A record read back must belong to the partition it was read from. */
export function assertInPartition(record: { organizationId?: unknown; deviceUserId?: unknown } | undefined, p: Partition, what: string) {
  if (!record || record.organizationId !== p.organizationId || record.deviceUserId !== p.deviceUserId) {
    throw new OfflineStorageError('PARTITION_MISMATCH', `${what} does not belong to the current partition`)
  }
}
