// Offline 4 · opening the app without a connection: the last-known binding opens public capture only; without one,
// the device says it needs a connection. Online answers keep the binding current or remove it.
import 'fake-indexeddb/auto'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../modules/org/api', async (orig) => ({
  ...(await orig<typeof import('../modules/org/api')>()),
  getDeviceContext: vi.fn(), readStoredPrincipal: vi.fn(), watchDevicePrincipal: vi.fn(),
}))
vi.mock('../modules/services/offline', async (orig) => ({
  ...(await orig<typeof import('../modules/services/offline')>()),
  refreshCaptureSnapshot: vi.fn(async () => {}),
  serviceDrainer: vi.fn(async () => ({ synced: 0, failed: 0, conflicts: 0 })),
}))
import { getDeviceContext, readStoredPrincipal, watchDevicePrincipal } from '../modules/org/api'
import { useOrganization } from '../modules/org/OrganizationContext'
import { AppError } from '../shared/errors'
import { readBinding, saveBinding } from '../shared/offline/binding'
import { openSharedOfflineDb } from '../shared/offline/db'
import { useOfflineRuntime } from '../shared/offline/runtime'
import { createOfflineStore } from '../shared/offline/store'
import { DeviceGate } from './DeviceGate'
import { RequireConnection } from './RequireConnection'
import { BOOT_BRAND_ID } from './bootBrand'
import { BootBrandGate } from './BootBrandGate'

const ORG = '00000000-0000-4000-8000-0000000000f6'
const org = { id: ORG, name: 'Teste Offline O', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
let online = true
Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })
let user: string

function Home() {
  const o = useOrganization()
  const r = useOfflineRuntime()
  return <p data-testid="home">{o.name} · {r.bindingSource} · {String(r.partitionActive)}</p>
}
function mount(path = '/') {
  const router = createMemoryRouter([{ path: '/', element: <DeviceGate />, children: [
    { index: true, element: <Home /> },
    { path: 'privado/entrar', element: <RequireConnection title="Área privada"><p>Entrar com PIN</p></RequireConnection> },
    { path: 'ajuda', element: <p>Ajuda pública</p> },
  ] }], { initialEntries: [path] })
  // as main.tsx: the Brand Splash gate around the app (a no-op when no brand is painted)
  return render(<BootBrandGate><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider></BootBrandGate>)
}

beforeEach(() => {
  user = crypto.randomUUID()
  online = true
  vi.mocked(readStoredPrincipal).mockReturnValue(user)
  vi.mocked(watchDevicePrincipal).mockImplementation((cb) => { cb(user); return () => {} })
})
afterEach(() => vi.clearAllMocks())

describe('offline start', () => {
  it('opens public capture on the cached binding — and not the private area', async () => {
    await saveBinding(await openSharedOfflineDb(), { deviceUserId: user, organization: org, verifiedAt: new Date().toISOString() })
    online = false
    vi.mocked(getDeviceContext).mockRejectedValue(new AppError('network', 'Failed to fetch'))   // the request fails offline
    mount()
    expect((await screen.findByTestId('home')).textContent).toBe('Teste Offline O · cache · true')
  })
  it('the cached binding never opens the private area', async () => {
    await saveBinding(await openSharedOfflineDb(), { deviceUserId: user, organization: org, verifiedAt: new Date().toISOString() })
    online = false
    vi.mocked(getDeviceContext).mockRejectedValue(new AppError('network', 'Failed to fetch'))
    mount('/privado/entrar')
    expect((await screen.findByTestId('needs-connection')).textContent).toBe('A área privada precisa de ligação.')
    expect(screen.queryByText('Entrar com PIN')).toBeNull()
  })
  it('server unreachable with the browser online: the cached binding, still no private area', async () => {
    await saveBinding(await openSharedOfflineDb(), { deviceUserId: user, organization: org, verifiedAt: new Date().toISOString() })
    vi.mocked(getDeviceContext).mockRejectedValue(new AppError('network', 'Failed to fetch'))
    mount('/privado/entrar')
    expect(await screen.findByTestId('needs-connection')).toBeTruthy()
  })
  // Android A2 · 155 device_context requests in two minutes: navigator.onLine said online, the server was not reachable
  it('server unreachable with the browser online: asked once, not again and again (no «A carregar…» loop)', async () => {
    await saveBinding(await openSharedOfflineDb(), { deviceUserId: user, organization: org, verifiedAt: new Date().toISOString() })
    vi.mocked(getDeviceContext).mockRejectedValue(new AppError('network', 'Failed to fetch'))
    mount()
    // the device context's own retry (one, while the browser says online) comes first
    expect((await screen.findByTestId('home', {}, { timeout: 3000 })).textContent).toBe('Teste Offline O · cache · true')
    const asked = vi.mocked(getDeviceContext).mock.calls.length
    await new Promise((r) => setTimeout(r, 300))
    expect(vi.mocked(getDeviceContext).mock.calls.length).toBe(asked)
    expect(screen.getByTestId('home')).toBeTruthy()
  })
  it('the connection returning (offline → online) asks the server again, once, and leaves the cached binding', async () => {
    await saveBinding(await openSharedOfflineDb(), { deviceUserId: user, organization: org, verifiedAt: new Date().toISOString() })
    online = false
    vi.mocked(getDeviceContext).mockRejectedValue(new AppError('network', 'Failed to fetch'))
    mount()
    expect((await screen.findByTestId('home')).textContent).toBe('Teste Offline O · cache · true')
    const asked = vi.mocked(getDeviceContext).mock.calls.length
    vi.mocked(getDeviceContext).mockResolvedValue({ bound: true, organization: org })
    act(() => { online = true; window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(screen.getByTestId('home').textContent).toBe('Teste Offline O · server · true'))
    expect(vi.mocked(getDeviceContext).mock.calls.length).toBe(asked + 1)
  })
  describe('back in the foreground on the cached binding (the server may be back with no connectivity change)', () => {
    const foreground = () => act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    const unreachableThenHome = async () => {
      await saveBinding(await openSharedOfflineDb(), { deviceUserId: user, organization: org, verifiedAt: new Date().toISOString() })
      vi.mocked(getDeviceContext).mockRejectedValue(new AppError('network', 'Failed to fetch'))
      mount()
      expect((await screen.findByTestId('home', {}, { timeout: 3000 })).textContent).toBe('Teste Offline O · cache · true')
      return vi.mocked(getDeviceContext).mock.calls.length
    }
    it('the server answering: asked once in the background, the server binding replaces the cached one', async () => {
      const asked = await unreachableThenHome()
      vi.mocked(getDeviceContext).mockResolvedValue({ bound: true, organization: org })
      foreground()
      await waitFor(() => expect(screen.getByTestId('home').textContent).toBe('Teste Offline O · server · true'))
      expect(vi.mocked(getDeviceContext).mock.calls.length).toBe(asked + 1)
    })
    it('still unreachable: one request at a time, the cached binding stays on screen (no «A carregar…»), nothing after the failure', async () => {
      const asked = await unreachableThenHome()
      let fail!: (e: unknown) => void
      vi.mocked(getDeviceContext).mockReturnValue(new Promise((_, reject) => { fail = reject }))
      foreground()
      foreground()                                               // a second resume while the first request is out
      expect(vi.mocked(getDeviceContext).mock.calls.length).toBe(asked + 1)
      expect(screen.getByTestId('home').textContent).toBe('Teste Offline O · cache · true')
      expect(screen.queryByText('A carregar…')).toBeNull()
      await act(async () => { fail(new AppError('network', 'Failed to fetch')) })
      await new Promise((r) => setTimeout(r, 300))
      expect(vi.mocked(getDeviceContext).mock.calls.length).toBe(asked + 1)    // a failure never asks again by itself
      expect(screen.getByTestId('home').textContent).toBe('Teste Offline O · cache · true')
    })
    it('offline: not asked (the connection returning does that)', async () => {
      await saveBinding(await openSharedOfflineDb(), { deviceUserId: user, organization: org, verifiedAt: new Date().toISOString() })
      online = false
      vi.mocked(getDeviceContext).mockRejectedValue(new AppError('network', 'Failed to fetch'))
      mount()
      expect((await screen.findByTestId('home')).textContent).toBe('Teste Offline O · cache · true')
      const asked = vi.mocked(getDeviceContext).mock.calls.length
      foreground()
      await new Promise((r) => setTimeout(r, 100))
      expect(vi.mocked(getDeviceContext).mock.calls.length).toBe(asked)
    })
  })
  it('without a cached binding (or for another principal) it needs a connection', async () => {
    await saveBinding(await openSharedOfflineDb(), { deviceUserId: crypto.randomUUID(), organization: org, verifiedAt: new Date().toISOString() })
    online = false
    vi.mocked(getDeviceContext).mockRejectedValue(new AppError('network', 'Failed to fetch'))
    mount()
    expect(await screen.findByText(/precisa de ligação para abrir o Beauty OS/)).toBeTruthy()
    expect(screen.queryByTestId('home')).toBeNull()
  })
})

describe('online answers', () => {
  it('bound: the server binding is used and cached', async () => {
    vi.mocked(getDeviceContext).mockResolvedValue({ bound: true, organization: org })
    mount()
    expect((await screen.findByTestId('home')).textContent).toBe('Teste Offline O · server · true')
    await waitFor(async () => expect((await readBinding(await openSharedOfflineDb(), user))?.organization).toEqual(org))
  })
  it('not bound (revoked): enrollment, the binding removed, queued work kept and counted', async () => {
    const db = await openSharedOfflineDb()
    await saveBinding(db, { deviceUserId: user, organization: org, verifiedAt: new Date().toISOString() })
    await createOfflineStore(db, { organizationId: ORG, deviceUserId: user }).outbox.put({
      commandId: crypto.randomUUID(), type: 'record_service', occurredAt: new Date().toISOString(), payload: { p_value_minor: 1 } })
    vi.mocked(getDeviceContext).mockResolvedValue({ bound: false })
    mount()
    expect(await screen.findByText('Ligar este dispositivo')).toBeTruthy()
    await waitFor(async () => expect(await readBinding(db, user)).toBeNull())
    expect((await screen.findByTestId('held-elsewhere')).textContent).toMatch(/Há 1 registo guardado/)
    expect(await createOfflineStore(db, { organizationId: ORG, deviceUserId: user }).outbox.countPending()).toBe(1)
  })
})

// Learning experience L2 · the help is public on an enrolled device only (ADR-0009: unbound devices see nothing but enrollment).
describe('Ajuda behind the device gate', () => {
  it('never enrolled, or revoked: /ajuda shows enrollment, not the help', async () => {
    vi.mocked(getDeviceContext).mockResolvedValue({ bound: false })
    mount('/ajuda')
    expect(await screen.findByText('Ligar este dispositivo')).toBeTruthy()
    expect(screen.queryByText('Ajuda pública')).toBeNull()
  })
  it('enrolled: the help opens, online or on the cached binding offline, with no PIN', async () => {
    vi.mocked(getDeviceContext).mockResolvedValue({ bound: true, organization: org })
    const view = mount('/ajuda')
    expect(await screen.findByText('Ajuda pública')).toBeTruthy()
    view.unmount()
    await saveBinding(await openSharedOfflineDb(), { deviceUserId: user, organization: org, verifiedAt: new Date().toISOString() })
    online = false
    vi.mocked(getDeviceContext).mockRejectedValue(new AppError('network', 'Failed to fetch'))
    mount('/ajuda')
    expect(await screen.findByText('Ajuda pública')).toBeTruthy()
  })
})

// Learning experience L1 · the Brand Splash painted by index.html stays only while DeviceGate is really loading, and
// leaves at every startup outcome — never over a usable screen or an error.
describe('Brand Splash during startup', () => {
  const brand = () => document.getElementById(BOOT_BRAND_ID)
  const gone = async () => waitFor(() => expect(brand() === null || brand()!.classList.contains('bb-leaving')).toBe(true))
  beforeEach(() => {
    const el = document.createElement('div')
    el.id = BOOT_BRAND_ID
    document.body.prepend(el)
  })
  afterEach(() => brand()?.remove())

  it('stays while the device context is still loading (and «A carregar…» stays the accessible status)', async () => {
    vi.mocked(getDeviceContext).mockReturnValue(new Promise(() => {}))
    mount()
    expect(await screen.findByText('A carregar…')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 50))
    expect(brand()!.classList.contains('bb-leaving')).toBe(false)
  })
  it('first time, never enrolled: leaves on «Ligar este dispositivo»', async () => {
    vi.mocked(readStoredPrincipal).mockReturnValue(null)
    vi.mocked(watchDevicePrincipal).mockImplementation((cb) => { cb(null); return () => {} })
    vi.mocked(getDeviceContext).mockResolvedValue({ bound: false })
    mount()
    expect(await screen.findByText('Ligar este dispositivo')).toBeTruthy()
    await gone()
  })
  it('enrolled, online: leaves on Hoje', async () => {
    vi.mocked(getDeviceContext).mockResolvedValue({ bound: true, organization: org })
    mount()
    await screen.findByTestId('home')
    await gone()
  })
  it('enrolled, offline with the cached binding: leaves on Hoje', async () => {
    await saveBinding(await openSharedOfflineDb(), { deviceUserId: user, organization: org, verifiedAt: new Date().toISOString() })
    online = false
    vi.mocked(getDeviceContext).mockRejectedValue(new AppError('network', 'Failed to fetch'))
    mount()
    expect((await screen.findByTestId('home')).textContent).toContain('cache')
    await gone()
  })
  it('offline without a cached binding: leaves on «precisa de ligação»', async () => {
    online = false
    vi.mocked(getDeviceContext).mockRejectedValue(new AppError('network', 'Failed to fetch'))
    mount()
    expect(await screen.findByText(/precisa de ligação para abrir o Beauty OS/)).toBeTruthy()
    await gone()
  })
  it('revoked binding: leaves on enrollment', async () => {
    await saveBinding(await openSharedOfflineDb(), { deviceUserId: user, organization: org, verifiedAt: new Date().toISOString() })
    vi.mocked(getDeviceContext).mockResolvedValue({ bound: false })
    mount()
    expect(await screen.findByText('Ligar este dispositivo')).toBeTruthy()
    await gone()
  })
  it('the server answers with an error: leaves on «Não foi possível ligar ao servidor»', async () => {
    vi.mocked(getDeviceContext).mockRejectedValue(new AppError('unexpected', 'boom'))
    mount()
    expect(await screen.findByText('Não foi possível ligar ao servidor.')).toBeTruthy()
    await gone()
  })
})
