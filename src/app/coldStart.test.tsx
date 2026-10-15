// Offline 5 · the cold-start offline path in the application (the shell itself comes from the service worker,
// tests/pwa/sw.test.ts): a device prepared online opens with no connection on its cached binding, captures a service
// from the kept salon data into one outbox item, keeps it across a restart, refuses the private area, and on
// reconnect the foreground drainer sends it once with its original command id and time.
import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

const { offlineError } = vi.hoisted(() => ({ offlineError: () => Promise.reject(new TypeError('Failed to fetch')) }))
vi.mock('../shared/supabase/client', () => ({ getSupabase: vi.fn(() => { throw new Error('no direct backend call') }), authStorageKey: () => 'k' }))
vi.mock('../modules/org/api', async (orig) => ({
  ...(await orig<typeof import('../modules/org/api')>()),
  getDeviceContext: vi.fn(), getSessionPrincipal: vi.fn(), readStoredPrincipal: vi.fn(), watchDevicePrincipal: vi.fn(), reportDeviceSync: vi.fn(async () => ({})),
}))
vi.mock('../modules/services/api', async (orig) => ({
  ...(await orig<typeof import('../modules/services/api')>()),
  getHojeSummary: vi.fn(offlineError), listCapturePeople: vi.fn(offlineError), listPaymentMethods: vi.fn(offlineError),
  listFrequentServices: vi.fn(offlineError), recordService: vi.fn(offlineError), submitQueuedService: vi.fn(),
}))
vi.mock('../modules/catalogue/api', async (orig) => ({ ...(await orig<typeof import('../modules/catalogue/api')>()), listServices: vi.fn(offlineError) }))
vi.mock('../modules/movements/snapshot', async (orig) => ({ ...(await orig<typeof import('../modules/movements/snapshot')>()), refreshMovementSnapshot: vi.fn(async () => {}) }))
vi.mock('../modules/stock/api', async (orig) => ({ ...(await orig<typeof import('../modules/stock/api')>()), countMarkedToBuy: vi.fn(offlineError) }))

import { getDeviceContext, getSessionPrincipal, readStoredPrincipal, reportDeviceSync, watchDevicePrincipal } from '../modules/org/api'
import { refreshMovementSnapshot } from '../modules/movements/snapshot'
import * as services from '../modules/services/api'
import { writeCaptureSnapshot } from '../modules/services/offline'
import { AppError } from '../shared/errors'
import { saveBinding } from '../shared/offline/binding'
import { openSharedOfflineDb } from '../shared/offline/db'
import { createOfflineStore } from '../shared/offline/store'
import { getSupabase } from '../shared/supabase/client'
import { HojePage } from '../spaces/hoje/HojePage'
import { RecordServiceFlow } from '../spaces/servicos/RecordServiceFlow'
import { DeviceGate } from './DeviceGate'
import { RequireConnection } from './RequireConnection'

const ORG = '00000000-0000-4000-8000-0000000000f6', USER = '11111111-1111-4111-8111-111111111111'
const org = { id: ORG, name: 'Teste Offline O', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const P1 = '00000000-0000-4000-8000-0000000099b1', S1 = '00000000-0000-4000-8000-0000000099c1', M1 = '00000000-0000-4000-8000-0000000099a0'
const partition = { organizationId: ORG, deviceUserId: USER }
let online = false
Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })

function launch(path = '/') {
  const router = createMemoryRouter([{ path: '/', element: <DeviceGate />, children: [
    { index: true, element: <HojePage /> },
    { path: 'servicos/registar', element: <RecordServiceFlow /> },
    { path: 'privado/entrar', element: <RequireConnection title="Área privada"><p>Entrar com PIN</p></RequireConnection> },
  ] }], { initialEntries: [path] })
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>)
}
const outbox = async () => createOfflineStore(await openSharedOfflineDb(), partition).outbox.list()

describe('cold start without a connection', () => {
  it('prepared device: open, capture, restart, private refused, reconnect sends once', async () => {
    // prepared online earlier (Offline 4): the cached binding and the capture snapshot
    const db = await openSharedOfflineDb()
    await saveBinding(db, { deviceUserId: USER, organization: org, verifiedAt: new Date().toISOString() })
    await writeCaptureSnapshot(createOfflineStore(db, partition), {
      people: [{ id: P1, display_name: 'Ana', capabilities: ['Cabelo'] }],
      services: [{ id: S1, name: 'Corte', default_price_minor: 500000 }],
      paymentMethods: [{ id: M1, code: 'numerario', label: 'Numerário' }],
    })
    vi.mocked(readStoredPrincipal).mockReturnValue(USER)
    vi.mocked(watchDevicePrincipal).mockImplementation((cb) => { cb(USER); return () => {} })
    vi.mocked(getDeviceContext).mockRejectedValue(new AppError('network', 'Failed to fetch'))

    // 1 · open with no connection: Hoje on the cached binding, no server figures, no fabricated zero
    let app = launch()
    expect(await screen.findByTestId('hoje-offline-note')).toBeTruthy()
    expect(screen.queryByTestId('count-line')).toBeNull()

    // 2 · Registar serviço from the kept salon data → one outbox item
    fireEvent.click(screen.getByRole('link', { name: 'Registar serviço' }))
    fireEvent.click(await screen.findByText('Ana'))
    fireEvent.click(await screen.findByText('Corte'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar serviço' }))
    expect(await screen.findByRole('heading', { name: 'Guardado neste telemóvel' })).toBeTruthy()
    const [item, ...more] = await outbox()
    expect(more).toEqual([])
    expect(item).toMatchObject({ type: 'record_service', state: 'local', payload: { p_person_id: P1, p_service_id: S1, p_value_minor: 500000 } })

    // 3 · close and reopen, still offline: the item is kept, once
    app.unmount()
    app = launch()
    expect(await screen.findByRole('button', { name: /1 registo por enviar/ })).toBeTruthy()
    expect((await outbox()).map((x) => [x.commandId, x.occurredAt])).toEqual([[item!.commandId, item!.occurredAt]])
    app.unmount()

    // 4 · a private URL boots the shell but the private area needs a connection
    app = launch('/privado/entrar')
    expect((await screen.findByTestId('needs-connection')).textContent).toBe('A área privada precisa de ligação.')
    expect(screen.queryByText('Entrar com PIN')).toBeNull()
    app.unmount()
    for (const f of [services.listCapturePeople, services.listPaymentMethods, services.recordService, services.submitQueuedService]) expect(f).not.toHaveBeenCalled()

    // 5 · reconnect: the device context and the session are checked, then the item is sent once
    app = launch()
    await screen.findByRole('button', { name: /1 registo por enviar/ })
    vi.mocked(getDeviceContext).mockResolvedValue({ bound: true, organization: org })
    vi.mocked(getSessionPrincipal).mockResolvedValue(USER)
    vi.mocked(services.getHojeSummary).mockResolvedValue({ total: 1, by_method: [], last_at: null, recent: [] })
    vi.mocked(services.listCapturePeople).mockResolvedValue([])
    vi.mocked(services.listPaymentMethods).mockResolvedValue([])
    vi.mocked(services.submitQueuedService).mockResolvedValue({ record_id: '00000000-0000-4000-8000-0000000099ee', occurred_at: item!.occurredAt })
    act(() => { online = true; window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(screen.queryByRole('button', { name: /por enviar/ })).toBeNull())
    expect(getSessionPrincipal).toHaveBeenCalled()
    expect(services.submitQueuedService).toHaveBeenCalledTimes(1)
    const [sentId, , sentAt] = vi.mocked(services.submitQueuedService).mock.calls[0]!
    expect([sentId, sentAt]).toEqual([item!.commandId, item!.occurredAt])
    expect((await outbox())[0]).toMatchObject({ state: 'synced', ack: { record_id: '00000000-0000-4000-8000-0000000099ee' } })
    // the app leaves the cached binding (Offline 7): server figures on Hoje, kept salon data refreshed, and this
    // phone's sync report — nothing left
    expect(await screen.findByTestId('count-line')).toBeTruthy()
    await waitFor(() => expect(refreshMovementSnapshot).toHaveBeenCalled())
    await waitFor(() => expect(reportDeviceSync).toHaveBeenLastCalledWith({ days: [], undated: { services: 0, drafts: 0, conflicts: 0 } }))

    // and nothing is sent again
    act(() => { window.dispatchEvent(new Event('online')) })
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(services.submitQueuedService).toHaveBeenCalledTimes(1)
    expect(getSupabase).not.toHaveBeenCalled()
    app.unmount()
  })
})
