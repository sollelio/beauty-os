// Offline 2 · what may be stored on the device (ADR-0010 §4): plain data, canonical times, integer money, and never
// the names of secrets or private finance.
import { describe, expect, it } from 'vitest'
import { OfflineStorageError } from './errors'
import { assertSafeData, isForbiddenField, isIsoInstant, sameData } from './validate'

const codeOf = (fn: () => unknown) => {
  try { fn() } catch (e) { return e instanceof OfflineStorageError ? e.code : 'other' }
  return 'ok'
}

describe('forbidden field names', () => {
  it('secrets, grants and private finance in any naming style', () => {
    for (const k of ['pin', 'PIN', 'p_secret', 'secret_hash', 'pinHash', 'pin_attempts', 'grant_id', 'p_grant_id', 'grantId', 'password',
      'access_token', 'captchaToken', 'private_session', 'privateContext', 'fecho', 'fechoState', 'situacao', 'negocio_health', 'position',
      'payable_minor', 'earned_minor', 'remuneration', 'reserve_used_minor', 'reserveAllocated', 'reserve_balance', 'reserve_allocations']) {
      expect(isForbiddenField(k), k).toBe(true)
    }
  })
  it('operational capture and catalogue fields are allowed', () => {
    for (const k of ['p_person_id', 'p_service_id', 'p_value_minor', 'p_payments', 'method_id', 'amount_minor', 'p_payment_method_id',
      'p_note', 'p_declared_operator_id', 'p_category_id', 'p_lines', 'product_id', 'quantity', 'line_cost_minor', 'new_product', 'unit_word',
      'p_salon_amount_minor', 'p_contributions', 'p_origin_id', 'display_name', 'default_price_minor', 'reserve_units', 'on_list', 'pinned', 'shipping']) {
      expect(isForbiddenField(k), k).toBe(false)
    }
  })
  it('are refused at any depth', () => {
    expect(codeOf(() => assertSafeData({ a: [{ b: { p_grant_id: 'x' } }] }))).toBe('FORBIDDEN_FIELD')
  })
})

describe('serialization', () => {
  it('accepts JSON-shaped data', () => {
    expect(codeOf(() => assertSafeData({ s: 'x', n: 1, b: true, z: null, a: [1, 'two', { c: [] }], o: Object.assign(Object.create(null), { k: 1 }) }))).toBe('ok')
  })
  it('refuses what is not plain, structured-clone-safe data', () => {
    for (const v of [{ d: new Date() }, { u: undefined }, { b: 10n }, { f: () => 1 }, { m: new Map() }, { n: Number.NaN }, { i: Infinity },
      { s: Symbol('x') }, { c: new (class Thing {})() }]) {
      expect(codeOf(() => assertSafeData(v)), String(Object.keys(v))).toBe('MALFORMED_RECORD')
    }
    let deep: Record<string, unknown> = {}
    const root = deep
    for (let i = 0; i < 20; i++) deep = (deep.x = {}) as Record<string, unknown>
    expect(codeOf(() => assertSafeData(root))).toBe('MALFORMED_RECORD')
  })
  it('money stays in integer minor units', () => {
    expect(codeOf(() => assertSafeData({ p_value_minor: 350000, lines: [{ line_cost_minor: 0 }], note_minor: null }))).toBe('ok')
    for (const v of [{ p_value_minor: 3500.5 }, { amountMinor: '350000' }, { line_cost_minor: 2 ** 60 }]) {
      expect(codeOf(() => assertSafeData(v)), JSON.stringify(v)).toBe('MALFORMED_RECORD')
    }
  })
  it('one time representation: toISOString', () => {
    expect(isIsoInstant('2026-10-15T09:30:00.000Z')).toBe(true)
    for (const t of ['2026-10-15T09:30:00Z', '2026-10-15T10:30:00.000+01:00', '2026-10-15', 'agora', '']) expect(isIsoInstant(t), t).toBe(false)
  })
  it('compares data independently of key order', () => {
    expect(sameData({ a: 1, b: [{ x: 1, y: 2 }] }, { b: [{ y: 2, x: 1 }], a: 1 })).toBe(true)
    expect(sameData({ a: [1, 2] }, { a: [2, 1] })).toBe(false)
  })
})
