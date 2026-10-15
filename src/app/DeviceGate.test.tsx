// Offline 4 · opening the app without a connection: the last-known binding opens public capture only; without one,
// the device says it needs a connection. Online answers keep the binding current or remove it.
import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
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
  ] }], { initialEntries: [path] })
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>)
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
