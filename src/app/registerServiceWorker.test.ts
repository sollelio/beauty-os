// Offline 5 · the static-shell worker is registered in production builds only, at the root scope, always revalidated.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './registerServiceWorker'

const nav = () => ({ serviceWorker: { register: vi.fn(async () => ({})) } }) as unknown as Navigator
afterEach(() => vi.unstubAllEnvs())

describe('registerServiceWorker', () => {
  it('not in development', () => {
    vi.stubEnv('PROD', false)
    const n = nav()
    registerServiceWorker(n)
    expect(n.serviceWorker.register).not.toHaveBeenCalled()
  })
  it('in production: /sw.js at "/", bypassing the HTTP cache for the worker script', () => {
    vi.stubEnv('PROD', true)
    const n = nav()
    registerServiceWorker(n)
    expect(n.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
  })
  it('in production on the web (not the Capacitor shell): registered', () => {
    vi.stubEnv('PROD', true)
    const n = nav()
    registerServiceWorker(n, false)
    expect(n.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
  })
  it('not in the Capacitor Android shell (Android A1), even in production', () => {
    vi.stubEnv('PROD', true)
    const n = nav()
    registerServiceWorker(n, true)
    expect(n.serviceWorker.register).not.toHaveBeenCalled()
  })
  it('a browser without service workers keeps working as before', () => {
    vi.stubEnv('PROD', true)
    expect(() => registerServiceWorker({} as Navigator)).not.toThrow()
  })
  it('a failed registration is harmless', async () => {
    vi.stubEnv('PROD', true)
    const n = { serviceWorker: { register: vi.fn(async () => { throw new Error('blocked') }) } } as unknown as Navigator
    registerServiceWorker(n)
    await Promise.resolve()
    expect(n.serviceWorker.register).toHaveBeenCalled()
  })
})
