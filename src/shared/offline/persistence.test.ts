// Offline 2 · navigator.storage.persist() wrapper (ADR-0010 §8): explicit, non-fatal, no durability claim.
import { describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from './persistence'

describe('requestPersistentStorage', () => {
  it('reports granted and denied', async () => {
    expect(await requestPersistentStorage({ storage: { persist: async () => true } })).toBe('granted')
    expect(await requestPersistentStorage({ storage: { persist: async () => false } })).toBe('denied')
  })
  it('is non-fatal where the API is missing or fails', async () => {
    expect(await requestPersistentStorage(undefined)).toBe('unavailable')
    expect(await requestPersistentStorage({})).toBe('unavailable')
    expect(await requestPersistentStorage({ storage: {} })).toBe('unavailable')
    expect(await requestPersistentStorage({ storage: { persist: async () => { throw new Error('SecurityError') } } })).toBe('unavailable')
  })
  it('asks only when called', async () => {
    const persist = vi.fn(async () => true)
    expect(persist).not.toHaveBeenCalled()
    await requestPersistentStorage({ storage: { persist } })
    expect(persist).toHaveBeenCalledTimes(1)
  })
})
