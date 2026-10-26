// Offline 7 · Para rever: what the server refused, explained calmly; only safe, explicit actions; nothing re-dated,
// moved or substituted; another binding's work counted, never shown, purged only on request.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderScreen } from '../../test/router'

vi.mock('../../shared/supabase/client', () => ({ getSupabase: vi.fn(() => { throw new Error('no direct backend call') }), authStorageKey: () => 'k' }))
vi.mock('../../modules/services/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/services/api')>()),
  listCapturePeople: vi.fn(async () => [{ id: '00000000-0000-4000-8000-0000000099b1', display_name: 'Ana', capabilities: ['Cabelo'] }]),
  listPaymentMethods: vi.fn(async () => [{ id: '00000000-0000-4000-8000-0000000099a0', code: 'numerario', label: 'Numerário' }]),
}))
vi.mock('../../modules/team/api', async (orig) => ({ ...(await orig<typeof import('../../modules/team/api')>()), recordAdvance: vi.fn() }))
vi.mock('../../modules/org/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/org/api')>()),
  listConfirmers: vi.fn(async () => [{ id: '00000000-0000-4000-8000-0000000099b2', display_name: 'Gestor O' }]), verifyPerson: vi.fn(async () => 'g'),
}))
import * as team from '../../modules/team/api'
import { readDraft, markRejected, saveDraft, type AdvanceForm } from '../../modules/movements/drafts'
import { writeCaptureSnapshot } from '../../modules/services/offline'
import { openOfflineDb } from '../../shared/offline/db'
import { OfflineRuntimeProvider } from '../../shared/offline/OfflineRuntimeProvider'
import { createOfflineStore } from '../../shared/offline/store'
import { AdvanceFlow } from '../equipa/AdvanceFlow'
import { ReviewPage } from './ReviewPage'

const ORG = '00000000-0000-4000-8000-0000000000f6', USER = '11111111-1111-4111-8111-111111111111', OTHER_USER = '22222222-2222-4222-8222-222222222222'
const orgRow = { id: ORG, name: 'Teste Offline O', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const P1 = '00000000-0000-4000-8000-0000000099b1', S1 = '00000000-0000-4000-8000-0000000099c1', M1 = '00000000-0000-4000-8000-0000000099a0'
const partition = { organizationId: ORG, deviceUserId: USER }
let online = true
Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })
let factory: IDBFactory
const openDb = () => openOfflineDb({ factory })
const store = async (p = partition) => createOfflineStore(await openDb(), p)
const wrap = (el: ReactNode) => (
  <OfflineRuntimeProvider organization={orgRow} principal={USER} bindingSource="server" serverBinding="bound" openDb={openDb} storageApi={{}}>{el}</OfflineRuntimeProvider>
)
async function conflict(code: string, value = 350000) {
  const s = await store()
  const item = await s.outbox.put({ commandId: crypto.randomUUID(), type: 'record_service', occurredAt: '2026-10-14T09:30:00.000Z',
    payload: { p_person_id: P1, p_service_id: S1, p_value_minor: value, p_payments: [{ method_id: M1, amount_minor: value }] } })
  await s.outbox.updateState(item.commandId, { state: 'syncing', attempts: 1 })
  await s.outbox.updateState(item.commandId, { state: 'conflict', lastError: code })
  return item
}
const renderReview = () => renderScreen('/rever', wrap(<ReviewPage />), { org: orgRow, routes: [{ path: '/servicos/registar', element: <p>Registar serviço (novo)</p> }] })

beforeEach(async () => {
  factory = new IDBFactory(); online = true; vi.clearAllMocks()
  await writeCaptureSnapshot(await store(), { people: [{ id: P1, display_name: 'Ana', capabilities: ['Cabelo'] }],
    services: [{ id: S1, name: 'Corte', default_price_minor: 350000 }], paymentMethods: [{ id: M1, code: 'numerario', label: 'Numerário' }] })
})

describe('service conflicts', () => {
  it('a calm reason, what and when — never a backend code', async () => {
    await conflict('PERIOD_APPROVED')
    renderReview()
    const card = await screen.findByTestId('service-conflict')
    expect(card.textContent).toMatch(/Corte · Ana/)
    expect(card.textContent).toMatch(/3\.500 Kz · guardado 14 out às 10:30/)
    expect(card.textContent).toMatch(/já tem os valores aprovados e não aceita novos registos/)
    expect(document.body.textContent).not.toMatch(/[A-Z]{4,}_[A-Z_]+/)
    expect(within(card).queryByRole('button', { name: 'Tentar novamente' })).toBeNull()       // retrying cannot fix it
  })
  it('a day without a period (a closed Sunday): a calm reason, its original time kept, never moved to another day', async () => {
    const item = await conflict('NO_PERIOD_FOR_DATE')
    renderReview()
    const card = await screen.findByTestId('service-conflict')
    expect(card.textContent).toMatch(/Não existe um período aberto para a data deste serviço\. Confirme a data ou fale com quem gere o salão\./)
    expect(card.textContent).toMatch(/guardado 14 out às 10:30/)
    expect(document.body.textContent).not.toMatch(/[A-Z]{4,}_[A-Z_]+/)
    expect(within(card).getAllByRole('button').map((b) => b.textContent)).toEqual(['Registar novamente', 'Descartar'])
    expect(await (await store()).outbox.get(item.commandId)).toMatchObject({ state: 'conflict', occurredAt: '2026-10-14T09:30:00.000Z' })
  })
  it('discard asks first; an uncertain one gets the stronger warning; it removes only the local item', async () => {
    const keep = await conflict('PERIOD_CLOSED')
    const gone = await conflict('IDEMPOTENCY_CONFLICT', 100000)
    renderReview()
    expect((await screen.findAllByTestId('service-conflict'))).toHaveLength(2)
    const uncertain = screen.getAllByTestId('service-conflict').find((c) => c.textContent?.includes('Não foi possível confirmar se este registo já foi recebido'))!
    fireEvent.click(within(uncertain).getByRole('button', { name: 'Descartar' }))
    expect(screen.getByRole('dialog').textContent).toMatch(/Pode já ter chegado ao servidor.*não apaga nada no servidor/)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Descartar' }))
    await waitFor(async () => expect(await (await store()).outbox.get(gone.commandId)).toBeNull())
    expect((await (await store()).outbox.get(keep.commandId))?.state).toBe('conflict')
    await waitFor(() => expect(screen.getAllByTestId('service-conflict')).toHaveLength(1))
  })
  it('a plain discard says nothing was registered on the server', async () => {
    await conflict('CAPTURE_TIME_TOO_OLD')
    renderReview()
    fireEvent.click(within(await screen.findByTestId('service-conflict')).getByRole('button', { name: 'Descartar' }))
    expect(screen.getByRole('dialog').textContent).toMatch(/Nada foi registado no servidor/)
    fireEvent.click(screen.getByRole('button', { name: 'Manter' }))
    expect(await (await store()).outbox.countPending()).toBe(1)
  })
  it.each(['PERSON_INACTIVE', 'SERVICE_INACTIVE', 'PAYMENT_METHOD_INACTIVE'])('%s: no blind retry of the same command — only Registar novamente or Descartar', async (code) => {
    const item = await conflict(code)
    renderReview()
    const card = await screen.findByTestId('service-conflict')
    expect(within(card).queryByRole('button', { name: 'Tentar novamente' })).toBeNull()
    expect(within(card).getAllByRole('button').map((b) => b.textContent)).toEqual(['Registar novamente', 'Descartar'])
    expect((await (await store()).outbox.get(item.commandId))?.state).toBe('conflict')
  })
  it('"Registar novamente" opens a new capture; the original stays until discarded', async () => {
    const item = await conflict('PERSON_INACTIVE')
    renderReview()
    fireEvent.click(within(await screen.findByTestId('service-conflict')).getByRole('button', { name: 'Registar novamente' }))
    expect(await screen.findByText('Registar serviço (novo)')).toBeTruthy()
    expect((await (await store()).outbox.get(item.commandId))?.state).toBe('conflict')
  })
})

describe('another binding\'s work on this phone', () => {
  it('counted, never shown; purged only after a strong confirmation, never moved into this partition', async () => {
    const other = await store({ organizationId: ORG, deviceUserId: OTHER_USER })
    await other.outbox.put({ commandId: crypto.randomUUID(), type: 'record_service', occurredAt: '2026-10-14T09:30:00.000Z', payload: { p_value_minor: 777777 } })
    renderReview()
    const box = await screen.findByTestId('foreign-work')
    expect(box.textContent).toMatch(/Há 1 registo guardado por uma ligação anterior\. Não pode ser enviado/)
    expect(document.body.textContent).not.toMatch(/7\.777|777777/)
    fireEvent.click(within(box).getByRole('button', { name: 'Apagar deste telemóvel' }))
    expect(screen.getByRole('dialog').textContent).toMatch(/Não pode ser desfeito/)
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    await waitFor(async () => expect(await other.outbox.list()).toEqual([]))
    expect(await (await store()).outbox.list()).toEqual([])                                  // nothing migrated here
  })
})

const form = (): AdvanceForm => ({ person: { id: P1, display_name: 'Ana', capabilities: ['Cabelo'] }, amountMinor: 1000000, paymentMethodId: M1, note: null })
async function openDraft(code: string) {
  const s = await store()
  const d = await saveDraft(s, 'advance', form(), { title: 'Ana', amount_minor: 1000000 })
  await markRejected(s, d.draftId, code)
  const base = `/equipa/adiantamento?rascunho=${d.draftId}`
  renderScreen('/equipa/adiantamento', wrap(<AdvanceFlow />), { org: orgRow, entries: ['/rascunhos', base, `${base}&passo=2`, `${base}&passo=3`], index: 3,
    routes: [{ path: '/rascunhos', element: <p>Lista de rascunhos</p> }] })
  return d
}

describe('drafts to review', () => {
  it('a day without a period: the reason in salon words; the draft stays (a period may still be created for that day)', async () => {
    await openDraft('NO_PERIOD_FOR_DATE')
    const review = await screen.findByTestId('draft-review')
    expect(review.textContent).toMatch(/Não existe um período aberto para esta data\. Confirme a data ou fale com quem gere o salão\./)
    expect(screen.queryByTestId('draft-blocked')).toBeNull()
  })
  it('an inactive reference stays editable and confirmable with a fresh PIN', async () => {
    await openDraft('PERSON_INACTIVE')
    expect(await screen.findByTestId('draft-review')).toBeTruthy()
    expect(screen.getByLabelText('PIN')).toBeTruthy()
    expect(screen.queryByTestId('draft-blocked')).toBeNull()
  })
  it.each(['PERIOD_APPROVED', 'CAPTURE_TIME_TOO_OLD'])('%s: no PIN, no confirmation — only discard or a clearly new movement', async (code) => {
    const d = await openDraft(code)
    expect(await screen.findByTestId('draft-blocked')).toBeTruthy()
    expect(screen.queryByLabelText('PIN')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Confirmar adiantamento' })).toBeNull()
    await new Promise((r) => setTimeout(r, 5))
    fireEvent.click(screen.getByRole('button', { name: 'Registar como novo' }))
    expect(screen.getByRole('dialog').textContent).toMatch(/hora de agora — conta no período atual, não no original/)
    fireEvent.click(screen.getByRole('button', { name: 'Criar novo rascunho' }))
    expect(await screen.findByText('Lista de rascunhos')).toBeTruthy()
    const all = await (await store()).drafts.list()
    expect(all).toHaveLength(1)
    expect(all[0]!.draftId).not.toBe(d.draftId)
    expect(all[0]!.capturedAt > d.capturedAt).toBe(true)                                     // a new capture time
    expect(all[0]!.payload).toMatchObject({ form: form(), attempt: null, review: null })       // a new intent, no command id yet
    expect(await readDraft(await store(), d.draftId)).toBeNull()
    expect(team.recordAdvance).not.toHaveBeenCalled()
  })
  it('possibly received already: no "Registar como novo", only discard', async () => {
    await openDraft('IDEMPOTENCY_CONFLICT')
    expect(await screen.findByTestId('draft-blocked')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Registar como novo' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Descartar rascunho' })).toBeTruthy()
  })
})
