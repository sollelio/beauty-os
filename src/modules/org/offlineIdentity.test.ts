// Offline 4 · the device identity without a network: a session that cannot be refreshed offline is "no connection",
// never "not bound"; the stored principal is read from the session kept in this browser.
import { beforeEach, describe, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }))
vi.mock('../../shared/supabase/client', () => ({ getSupabase: () => ({ auth, rpc: vi.fn() }), authStorageKey: () => 'sb-test-auth-token' }))
import { AuthRetryableFetchError } from '@supabase/supabase-js'
import { getDeviceContext, getSessionPrincipal, readStoredPrincipal, watchDevicePrincipal } from './api'

const USER = '11111111-1111-4111-8111-111111111111'
beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

describe('device identity offline', () => {
  it('an expired session that cannot be refreshed for lack of network is a network error, not "unbound"', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) })
    await expect(getDeviceContext()).rejects.toMatchObject({ kind: 'network' })
    await expect(getSessionPrincipal()).rejects.toMatchObject({ kind: 'network' })
  })
  it('no session at all is still "not bound"', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    expect(await getDeviceContext()).toEqual({ bound: false })
  })
  it('reads the stored principal without a network; nothing stored is null', () => {
    expect(readStoredPrincipal()).toBeNull()
    localStorage.setItem('sb-test-auth-token', JSON.stringify({ access_token: 'x', user: { id: USER } }))
    expect(readStoredPrincipal()).toBe(USER)
    localStorage.setItem('sb-test-auth-token', '{not json')
    expect(readStoredPrincipal()).toBeNull()
  })
  it('the watcher falls back to the stored principal when the client reports no session', () => {
    localStorage.setItem('sb-test-auth-token', JSON.stringify({ user: { id: USER } }))
    let handler: (e: string, s: unknown) => void = () => {}
    auth.onAuthStateChange.mockImplementation((h) => { handler = h; return { data: { subscription: { unsubscribe: vi.fn() } } } })
    const seen: (string | null)[] = []
    watchDevicePrincipal((u) => seen.push(u))
    handler('INITIAL_SESSION', null)
    handler('SIGNED_IN', { user: { id: USER } })
    localStorage.clear()
    handler('SIGNED_OUT', null)
    expect(seen).toEqual([USER, USER, null])
  })
})
