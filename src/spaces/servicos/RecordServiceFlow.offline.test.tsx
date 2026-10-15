// Offline 4 · Registar serviço without a connection: the salon data kept on the device, one outbox item per
// confirmation, honest wording, and no backend call at all while offline.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderScreen } from '../../test/router'

const { network } = vi.hoisted(() => ({ network: () => Promise.reject(new TypeError('Failed to fetch')) }))
vi.mock('../../shared/supabase/client', () => ({ getSupabase: vi.fn(() => { throw new Error('no backend call while offline') }), authStorageKey: () => 'k' }))
vi.mock('../../modules/services/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/services/api')>()),
  listCapturePeople: vi.fn(network), listFrequentServices: vi.fn(network), listPaymentMethods: vi.fn(network),
  recordService: vi.fn(network), submitQueuedService: vi.fn(network),
}))
vi.mock('../../modules/catalogue/api', async (orig) => ({ ...(await orig<typeof import('../../modules/catalogue/api')>()), listServices: vi.fn(network) }))
import { getSupabase } from '../../shared/supabase/client'
import * as servicesApi from '../../modules/services/api'
import * as catalogueApi from '../../modules/catalogue/api'
import { writeCaptureSnapshot } from '../../modules/services/offline'
import { openOfflineDb } from '../../shared/offline/db'
import { OfflineRuntimeProvider } from '../../shared/offline/OfflineRuntimeProvider'
import { createOfflineStore } from '../../shared/offline/store'
import { RecordServiceFlow } from './RecordServiceFlow'

const ORG = '00000000-0000-4000-8000-0000000000f6', USER = '11111111-1111-4111-8111-111111111111'
const org = { id: ORG, name: 'Teste Offline O', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const P1 = '00000000-0000-4000-8000-0000000099b1', S1 = '00000000-0000-4000-8000-0000000099c1', S2 = '00000000-0000-4000-8000-0000000099c2'
const M1 = '00000000-0000-4000-8000-0000000099a0', M2 = '00000000-0000-4000-8000-0000000099a1'
const PATH = '/servicos/registar'

let online = false
Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })
let factory: IDBFactory, persist: ReturnType<typeof vi.fn>
const openDb = () => openOfflineDb({ factory })
const partition = { organizationId: ORG, deviceUserId: USER }
async function snapshot(fetchedAt = new Date().toISOString()) {
  const db = await openDb()
  await writeCaptureSnapshot(createOfflineStore(db, partition), {
    people: [{ id: P1, display_name: 'Ana', capabilities: ['Cabelo'] }],
    services: [{ id: S1, name: 'Coloração', default_price_minor: 1200000 }, { id: S2, name: 'Corte', default_price_minor: 500000 }],
    paymentMethods: [{ id: M1, code: 'numerario', label: 'Numerário' }, { id: M2, code: 'transferencia', label: 'Transferência' }],
  }, fetchedAt)
  db.close()
}
async function outbox() {
  const db = await openDb()
  const items = await createOfflineStore(db, partition).outbox.list()
  db.close()
  return items
}
const renderFlow = () => renderScreen(PATH, (
  <OfflineRuntimeProvider organization={org} principal={USER} bindingSource="server" serverBinding="bound" openDb={openDb}
    storageApi={{ storage: { persisted: async () => false, persist: persist as unknown as () => Promise<boolean> } }}>
    <RecordServiceFlow />
  </OfflineRuntimeProvider>
), { org })
async function confirmService() {
  fireEvent.click(await screen.findByText('Ana'))
  fireEvent.click(await screen.findByText('Coloração'))
  fireEvent.click(screen.getByRole('button', { name: 'Misto' }))
  fireEvent.change(screen.getByLabelText('Numerário'), { target: { value: '10000' } })
  fireEvent.change(screen.getByLabelText('Transferência'), { target: { value: '2000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar serviço' }))
}

beforeEach(() => { factory = new IDBFactory(); online = false; persist = vi.fn(async () => true); vi.clearAllMocks() })
afterEach(() => {
  expect(getSupabase).not.toHaveBeenCalled()
  for (const f of [servicesApi.listCapturePeople, servicesApi.listPaymentMethods, servicesApi.listFrequentServices, servicesApi.recordService,
    servicesApi.submitQueuedService, catalogueApi.listServices]) expect(f).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe('Registar serviço offline', () => {
  it('uses the kept salon data, stores one outbox item, and says it was saved on this phone', async () => {
    await snapshot()
    const before = Date.now()
    renderFlow()
    await confirmService()
    expect(await screen.findByRole('heading', { name: 'Guardado neste telemóvel' })).toBeTruthy()
    expect(screen.getByText('Será enviado quando houver ligação.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/registado|sincronizado/i)
    expect(screen.queryByText('Corrigir este registo')).toBeNull()                     // there is no server record yet
    const items = await outbox()
    expect(items).toHaveLength(1)
    const [item] = items
    expect(item).toMatchObject({ type: 'record_service', state: 'local', attempts: 0, payload: {
      p_person_id: P1, p_service_id: S1, p_value_minor: 1200000,
      p_payments: [{ method_id: M1, amount_minor: 1000000 }, { method_id: M2, amount_minor: 200000 }],
    } })
    expect(Date.parse(item!.occurredAt)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(item!.occurredAt)).toBeLessThanOrEqual(Date.now())
  })
  it('a storage failure does not show success; the same confirmation then stores it with the same command id and time', async () => {
    await snapshot()
    renderFlow()
    const add = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    await confirmService()
    expect(await screen.findByText('Não foi possível guardar neste telemóvel. Os dados continuam aqui.')).toBeTruthy()
    expect(screen.queryByText('Guardado neste telemóvel')).toBeNull()
    add.mockRestore()
    await new Promise((r) => setTimeout(r, 5))
    const retryAt = Date.now()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('heading', { name: 'Guardado neste telemóvel' })).toBeTruthy()
    const items = await outbox()
    expect(items).toHaveLength(1)
    expect(Date.parse(items[0]!.occurredAt)).toBeLessThan(retryAt)                         // the time of the first confirmation
  })
  it('without kept salon data it blocks clearly', async () => {
    renderFlow()
    expect((await screen.findByTestId('offline-blocked')).textContent).toMatch(/nas últimas 48 horas/)
    expect(screen.queryByText('Ana')).toBeNull()
  })
  it('with salon data older than 48 hours it blocks a new service', async () => {
    await snapshot(new Date(Date.now() - 49 * 3600_000).toISOString())
    renderFlow()
    expect((await screen.findByTestId('offline-blocked')).textContent).toMatch(/mais de 48 horas/)
    expect(screen.queryByText('Ana')).toBeNull()
  })
  it('with salon data from up to 48 hours ago it allows it', async () => {
    await snapshot(new Date(Date.now() - 47 * 3600_000).toISOString())
    renderFlow()
    expect(await screen.findByText('Ana')).toBeTruthy()
  })
  it('asks the browser to keep the data once, after the first service saved on the device — not for every service', async () => {
    await snapshot()
    renderFlow()
    await confirmService()
    await screen.findByRole('heading', { name: 'Guardado neste telemóvel' })
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Registar outro serviço' }))
    await confirmService()
    await screen.findByRole('heading', { name: 'Guardado neste telemóvel' })
    await act(() => new Promise((r) => setTimeout(r, 20)))
    expect(persist).toHaveBeenCalledTimes(1)
    expect(await outbox()).toHaveLength(2)
  })
})

describe('Registar serviço online (unchanged)', () => {
  it('submits directly, queues nothing, and keeps the lists it loaded for offline use', async () => {
    online = true
    vi.mocked(servicesApi.listCapturePeople).mockResolvedValue([{ id: P1, display_name: 'Ana', capabilities: ['Cabelo'] }])
    vi.mocked(servicesApi.listPaymentMethods).mockResolvedValue([{ id: M1, code: 'numerario', label: 'Numerário' }])
    vi.mocked(servicesApi.listFrequentServices).mockResolvedValue([])
    vi.mocked(catalogueApi.listServices).mockResolvedValue([{ id: S1, name: 'Coloração', default_price_minor: 1200000 }])
    vi.mocked(servicesApi.recordService).mockResolvedValue({ record_id: '00000000-0000-4000-8000-0000000099ee', occurred_at: new Date().toISOString() })
    renderFlow()
    fireEvent.click(await screen.findByText('Ana'))
    fireEvent.click(await screen.findByText('Coloração'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar serviço' }))
    expect(await screen.findByText('Serviço registado com sucesso.')).toBeTruthy()
    expect(vi.mocked(servicesApi.recordService).mock.calls[0]![1]).toEqual({ personId: P1, serviceId: S1, valueMinor: 1200000, payments: [{ method_id: M1, amount_minor: 1200000 }] })
    expect(servicesApi.submitQueuedService).not.toHaveBeenCalled()
    expect(await outbox()).toEqual([])
    const db = await openDb()
    await waitFor(async () => expect((await createOfflineStore(db, partition).snapshot.listMeta()).map((m) => m.group)).toEqual(['paymentMethods', 'people', 'services']))
    db.close()
    vi.mocked(servicesApi.listCapturePeople).mockClear(); vi.mocked(servicesApi.listPaymentMethods).mockClear()
    vi.mocked(servicesApi.listFrequentServices).mockClear(); vi.mocked(catalogueApi.listServices).mockClear(); vi.mocked(servicesApi.recordService).mockClear()
  })
})
