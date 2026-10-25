// Offline 6 · Adiantamento / Despesa / Compra without a connection become drafts on this phone (no PIN, nothing sent);
// online, a draft is confirmed with the live confirmer/PIN and its original capture time — once, whatever happens.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderScreen } from '../../test/router'

const { offline } = vi.hoisted(() => ({ offline: () => Promise.reject(new TypeError('Failed to fetch')) }))
vi.mock('../../shared/supabase/client', () => ({ getSupabase: vi.fn(() => { throw new Error('no direct backend call') }), authStorageKey: () => 'k' }))
vi.mock('../../modules/services/api', async (orig) => ({ ...(await orig<typeof import('../../modules/services/api')>()), listCapturePeople: vi.fn(offline), listPaymentMethods: vi.fn(offline) }))
vi.mock('../../modules/money/api', async (orig) => ({ ...(await orig<typeof import('../../modules/money/api')>()), listExpenseCategories: vi.fn(offline), recordExpense: vi.fn() }))
vi.mock('../../modules/purchasing/api', async (orig) => ({ ...(await orig<typeof import('../../modules/purchasing/api')>()), listPurchaseOrigins: vi.fn(offline), recordPurchase: vi.fn() }))
vi.mock('../../modules/stock/api', async (orig) => ({ ...(await orig<typeof import('../../modules/stock/api')>()), listProducts: vi.fn(offline), listUnitWords: vi.fn(offline), updateStock: vi.fn(async () => ({})) }))
vi.mock('../../modules/team/api', async (orig) => ({ ...(await orig<typeof import('../../modules/team/api')>()), recordAdvance: vi.fn() }))
vi.mock('../../modules/org/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/org/api')>()),
  listPeople: vi.fn(offline), listConfirmers: vi.fn(async () => [{ id: '00000000-0000-4000-8000-0000000099b2', display_name: 'Gestor O' }]),
  verifyPerson: vi.fn(async () => 'grant-fresh-1'),
}))
import * as org from '../../modules/org/api'
import * as team from '../../modules/team/api'
import * as money from '../../modules/money/api'
import * as purchasing from '../../modules/purchasing/api'
import { createServiceDrainer } from '../../modules/services/offline'
import { writeCaptureSnapshot } from '../../modules/services/offline'
import { writeMovementSnapshot } from '../../modules/movements/snapshot'
import { readDraft, saveDraft, type AdvanceForm } from '../../modules/movements/drafts'
import { loadTrip, saveTrip } from '../../modules/stock/trip'
import { AppError, toAppError } from '../../shared/errors'
import { openOfflineDb } from '../../shared/offline/db'
import { OfflineRuntimeProvider } from '../../shared/offline/OfflineRuntimeProvider'
import { createOfflineStore } from '../../shared/offline/store'
import { isForbiddenField } from '../../shared/offline/validate'
import { AdvanceFlow } from '../equipa/AdvanceFlow'
import { ExpenseFlow } from '../dinheiro/ExpenseFlow'
import { PurchaseFlow } from '../dinheiro/PurchaseFlow'
import { DraftsPage } from './DraftsPage'

const ORG = '00000000-0000-4000-8000-0000000000f6', USER = '11111111-1111-4111-8111-111111111111'
const orgRow = { id: ORG, name: 'Teste Offline O', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const P1 = '00000000-0000-4000-8000-0000000099b1', M1 = '00000000-0000-4000-8000-0000000099a0', M2 = '00000000-0000-4000-8000-0000000099a1'
const C1 = '00000000-0000-4000-8000-0000000099d1', O1 = '00000000-0000-4000-8000-0000000099e1', PR1 = '00000000-0000-4000-8000-0000000099f1'
const partition = { organizationId: ORG, deviceUserId: USER }
const LIST_CALLS = () => [org.listPeople, money.listExpenseCategories, purchasing.listPurchaseOrigins]

let online = false
Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })
let factory: IDBFactory
const openDb = () => openOfflineDb({ factory })
const store = async () => createOfflineStore(await openDb(), partition)
const wrap = (el: ReactNode, drain?: Parameters<typeof OfflineRuntimeProvider>[0]['drain'], devicePurpose: 'operational' | 'support' = 'operational') => (
  <OfflineRuntimeProvider organization={orgRow} principal={USER} bindingSource="server" serverBinding="bound" devicePurpose={devicePurpose} openDb={openDb} storageApi={{}} drain={drain}>{el}</OfflineRuntimeProvider>
)
async function seedSnapshot(at = new Date().toISOString()) {
  const s = await store()
  await writeCaptureSnapshot(s, { people: [{ id: P1, display_name: 'Ana', capabilities: ['Cabelo'] }], services: [],
    paymentMethods: [{ id: M1, code: 'numerario', label: 'Numerário' }, { id: M2, code: 'transferencia', label: 'Transferência' }] }, at)
  await writeMovementSnapshot(s, { expenseCategories: [{ id: C1, label: 'Água', hint: 'Conta da água' }], purchaseOrigins: [{ id: O1, label: 'Mercado' }],
    products: [{ id: PR1, name: 'Acetona', unit_word: 'frasco' }], unitWords: ['unid.', 'frasco'], purchasePeople: [{ id: P1, display_name: 'Ana' }] }, at)
}
const drafts = async () => (await store()).drafts.list()
/** Every key and string kept on the device for this partition: no PIN, grant or private-session data. */
async function deviceText() {
  const db = await openDb()
  const all: unknown[] = []
  for (const name of ['outbox', 'drafts', 'snapshot', 'meta', 'binding']) {
    all.push(await new Promise((res) => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => res(r.result) }))
  }
  return JSON.stringify(all)
}
function keysOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(keysOf)
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => [k, ...keysOf(x)])
  return []
}

beforeEach(() => { factory = new IDBFactory(); online = false; vi.clearAllMocks(); localStorage.clear() })
afterEach(() => vi.restoreAllMocks())

describe('offline: a draft on this phone, no PIN, nothing sent', () => {
  it('Adiantamento from the kept lists → one draft with exactly the form, captured once', async () => {
    await seedSnapshot()
    const before = Date.now()
    renderScreen('/equipa/adiantamento', wrap(<AdvanceFlow />), { org: orgRow })
    fireEvent.click(await screen.findByText('Ana'))
    fireEvent.change(screen.getByLabelText('Valor entregue'), { target: { value: '15000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transferência' }))
    fireEvent.change(screen.getByLabelText('Nota (opcional)'), { target: { value: 'pedido hoje' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByRole('heading', { name: 'Guardar neste telemóvel' })).toBeTruthy()
    expect(screen.queryByText('Quem confirma?')).toBeNull()
    expect(screen.queryByLabelText('PIN')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar neste telemóvel' }))
    expect(await screen.findByRole('heading', { name: 'Guardado neste telemóvel' })).toBeTruthy()
    expect(screen.getByText('Por confirmar com PIN quando houver ligação.')).toBeTruthy()
    expect(screen.getByTestId('draft-saved').textContent).not.toMatch(/registad|confirmad|\bpago\b|sincronizad/i)
    const [d, ...more] = await drafts()
    expect(more).toEqual([])
    expect(d).toMatchObject({ type: 'advance', state: 'draft', payload: { form: { person: { id: P1 }, amountMinor: 1500000, paymentMethodId: M2, note: 'pedido hoje' } } })
    expect(Date.parse(d!.capturedAt)).toBeGreaterThanOrEqual(before)
    expect(team.recordAdvance).not.toHaveBeenCalled()
    expect(org.verifyPerson).not.toHaveBeenCalled()
    expect(org.listConfirmers).not.toHaveBeenCalled()
    for (const f of LIST_CALLS()) expect(f).not.toHaveBeenCalled()
  })
  it('Despesa with Misto keeps both parts in minor units', async () => {
    await seedSnapshot()
    renderScreen('/dinheiro/despesa', wrap(<ExpenseFlow />), { org: orgRow })
    fireEvent.click(await screen.findByText('Água'))
    fireEvent.change(screen.getByLabelText('Valor pago'), { target: { value: '12000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Misto' }))
    fireEvent.change(screen.getByLabelText('Numerário'), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText('Transferência'), { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar neste telemóvel' }))
    await screen.findByRole('heading', { name: 'Guardado neste telemóvel' })
    expect((await drafts())[0]).toMatchObject({ type: 'expense', payload: { form: { category: { id: C1 }, amountMinor: 1200000,
      payments: [{ method_id: M1, amount_minor: 1000000 }, { method_id: M2, amount_minor: 200000 }] } } })
    expect(money.recordExpense).not.toHaveBeenCalled()
  })
  it('Compra from Modo mercado: a durable draft first; the trip stays until the purchase really exists', async () => {
    await seedSnapshot()
    saveTrip(ORG, { items: [{ key: 'k1', plannedId: PR1, plannedName: 'Acetona', plannedUnit: 'frasco', plannedQty: 2, productId: PR1, name: 'Acetona',
      unitWord: 'frasco', qty: 2, status: 'bought', urgent: false, unplanned: false }] })
    renderScreen('/dinheiro/compra', wrap(<PurchaseFlow />), { org: orgRow, entries: [{ pathname: '/dinheiro/compra', state: { fromTrip: true } }] })
    fireEvent.click((await screen.findAllByRole('button', { name: /^Acetona/ }))[0]!)
    fireEvent.change(screen.getByLabelText('Quanto pagou por estas unidades'), { target: { value: '4500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar alteração' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Mercado' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    // a failed local write: no success, the trip untouched
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar neste telemóvel' }))
    expect(await screen.findByText('Não foi possível guardar neste telemóvel. Os dados continuam aqui.')).toBeTruthy()
    expect(loadTrip(ORG)).not.toBeNull()
    put.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar neste telemóvel' }))
    await screen.findByRole('heading', { name: 'Guardado neste telemóvel' })
    expect((await drafts())[0]).toMatchObject({ type: 'purchase', payload: { form: {
      lines: [{ productId: PR1, quantity: 2, costMinor: 450000 }], originId: O1, contributors: [], salonMinor: null, tripPlanIds: [PR1] } } })
    expect(loadTrip(ORG)).not.toBeNull()                                                     // kept: no purchase exists yet
    expect(purchasing.recordPurchase).not.toHaveBeenCalled()
  })
  it('stale or missing salon data blocks a new draft', async () => {
    renderScreen('/dinheiro/despesa', wrap(<ExpenseFlow />), { org: orgRow })
    expect((await screen.findByTestId('offline-blocked')).textContent).toMatch(/últimas 48 horas/)
  })
  it('a support device keeps no draft, even with fresh salon data: it says it saves movements online only', async () => {
    await seedSnapshot()
    renderScreen('/dinheiro/despesa', wrap(<ExpenseFlow />, undefined, 'support'), { org: orgRow })
    expect((await screen.findByTestId('offline-blocked')).textContent).toBe('Sem ligação. Este telemóvel é de apoio e só guarda movimentos com ligação.')
    expect(screen.queryByText('Água')).toBeNull()
    expect(await drafts()).toEqual([])
  })
  it('a draft stays after a restart, once; editing it keeps its capture time', async () => {
    await seedSnapshot()
    const d = await saveDraft(await store(), 'advance', advanceForm(), { title: 'Ana', amount_minor: 1000000 })
    const base = `/equipa/adiantamento?rascunho=${d.draftId}`
    renderScreen('/equipa/adiantamento', wrap(<AdvanceFlow />), { org: orgRow, entries: [base, `${base}&passo=2`, `${base}&passo=3`], index: 2 })
    expect(await screen.findByRole('heading', { name: 'Guardar neste telemóvel' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    fireEvent.change(await screen.findByLabelText('Valor entregue'), { target: { value: '20000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar neste telemóvel' }))
    await screen.findByRole('heading', { name: 'Guardado neste telemóvel' })
    const all = await drafts()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ draftId: d.draftId, capturedAt: d.capturedAt, payload: { form: { amountMinor: 2000000 } } })
  })
})

const advanceForm = (): AdvanceForm => ({ person: { id: P1, display_name: 'Ana', capabilities: ['Cabelo'] }, amountMinor: 1000000, paymentMethodId: M1, note: null })
async function openDraftOnline(capturedAt?: string) {
  online = true
  const s = await store()
  const d = await saveDraft(s, 'advance', advanceForm(), { title: 'Ana', amount_minor: 1000000 })
  if (capturedAt) await s.drafts.put({ draftId: d.draftId, type: 'advance', capturedAt, payload: d.payload as never })
  const base = `/equipa/adiantamento?rascunho=${d.draftId}`
  const { listCapturePeople, listPaymentMethods } = await import('../../modules/services/api')
  vi.mocked(listCapturePeople).mockResolvedValue([{ id: P1, display_name: 'Ana', capabilities: ['Cabelo'] }])
  vi.mocked(listPaymentMethods).mockResolvedValue([{ id: M1, code: 'numerario', label: 'Numerário' }])
  const view = () => renderScreen('/equipa/adiantamento', wrap(<AdvanceFlow />), { org: orgRow, entries: ['/rascunhos', base, `${base}&passo=2`, `${base}&passo=3`], index: 3,
    routes: [{ path: '/rascunhos', element: <p>Lista de rascunhos</p> }] })
  return { draft: (await readDraft(s, d.draftId))!, view }
}
async function confirmWithPin() {
  fireEvent.click(await screen.findByRole('button', { name: 'Gestor O' }))
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '919191' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar adiantamento' }))
}

describe('online: confirming a draft', () => {
  it('review, live confirmer list, fresh grant, original capture time → acknowledged → submitted', async () => {
    const { draft, view } = await openDraftOnline()
    vi.mocked(team.recordAdvance).mockResolvedValue({ advance_id: '00000000-0000-4000-8000-0000000099aa', occurred_at: draft.capturedAt, confirmed_by_person_id: 'x' })
    view()
    expect(await screen.findByRole('heading', { name: 'Confirmação necessária' })).toBeTruthy()
    expect(org.listConfirmers).toHaveBeenCalledWith('movement.confirm')
    await confirmWithPin()
    expect(await screen.findByText('Adiantamento registado com sucesso.')).toBeTruthy()
    const [cmd, grant, input, at] = vi.mocked(team.recordAdvance).mock.calls[0]!
    expect([grant, input, at]).toEqual(['grant-fresh-1', { personId: P1, amountMinor: 1000000, paymentMethodId: M1, note: null }, draft.capturedAt])
    expect(cmd).toMatch(/^[0-9a-f-]{36}$/)
    expect((await readDraft(await store(), draft.draftId))?.state).toBe('submitted')
    expect(await (await store()).drafts.countPending()).toBe(0)
    const text = await deviceText()
    expect(text).not.toContain('919191')
    expect(text).not.toContain('grant-fresh-1')
    expect(keysOf(JSON.parse(text)).filter(isForbiddenField)).toEqual([])
  })
  it('an uncertain answer: the draft stays, and the retry — even after leaving — reuses the command id', async () => {
    const { draft, view } = await openDraftOnline()
    vi.mocked(team.recordAdvance).mockRejectedValueOnce(new AppError('network', 'Failed to fetch'))
    const first = view()
    await confirmWithPin()
    await screen.findByText('Não foi possível guardar. Os dados continuam aqui.')
    expect((await readDraft(await store(), draft.draftId))).toMatchObject({ state: 'draft', payload: { attempt: { sent: true } } })
    first.unmount()
    vi.mocked(team.recordAdvance).mockResolvedValueOnce({ advance_id: '00000000-0000-4000-8000-0000000099aa', occurred_at: draft.capturedAt, confirmed_by_person_id: 'x', replayed: true })
    view()
    await confirmWithPin()
    await screen.findByText('Adiantamento registado com sucesso.')
    const calls = vi.mocked(team.recordAdvance).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1]![0]).toBe(calls[0]![0])
    expect(calls[1]![3]).toBe(calls[0]![3])
  })
  it.each(['PERSON_INACTIVE', 'PERIOD_APPROVED', 'PERIOD_CLOSED', 'NOT_AUTHORIZED', 'IDEMPOTENCY_CONFLICT'])('%s: the draft stays, marked for review, nothing changed', async (code) => {
    const { draft, view } = await openDraftOnline()
    vi.mocked(team.recordAdvance).mockRejectedValueOnce(toAppError({ message: code }))
    view()
    await confirmWithPin()
    await waitFor(async () => expect((await readDraft(await store(), draft.draftId))?.payload.review?.code).toBe(code))
    const after = (await readDraft(await store(), draft.draftId))!
    expect(after.state).toBe('draft')
    expect(after.payload.form).toEqual(draft.payload.form)
    expect(after.capturedAt).toBe(draft.capturedAt)
  })
  it('with a known server-time offset, a draft older than 48 hours in server time is not sent: review', async () => {
    const { draft, view } = await openDraftOnline(new Date(Date.now() - 47 * 3600_000).toISOString())     // 47 h by the phone…
    await (await store()).meta.set('lastServerTimeOffsetMs', 2 * 3600_000)                              // …49 h by the server
    view()
    await confirmWithPin()
    expect((await screen.findAllByText(/há mais de 48 horas/)).length).toBeGreaterThan(0)
    expect(team.recordAdvance).not.toHaveBeenCalled()
    const after = (await readDraft(await store(), draft.draftId))!
    expect(after.payload.review?.code).toBe('CAPTURE_TIME_TOO_OLD')
    expect(after.capturedAt).toBe(draft.capturedAt)                                                     // never rewritten
  })
  it('the same offset can say it is still inside the window: it is sent with its original time', async () => {
    const { draft, view } = await openDraftOnline(new Date(Date.now() - 49 * 3600_000).toISOString())     // 49 h by a fast phone…
    await (await store()).meta.set('lastServerTimeOffsetMs', -2 * 3600_000)                             // …47 h by the server
    vi.mocked(team.recordAdvance).mockResolvedValue({ advance_id: '00000000-0000-4000-8000-0000000099aa', occurred_at: draft.capturedAt, confirmed_by_person_id: 'x' })
    view()
    await confirmWithPin()
    await screen.findByText('Adiantamento registado com sucesso.')
    expect(vi.mocked(team.recordAdvance).mock.calls[0]![3]).toBe(draft.capturedAt)
  })
  it('without a known offset the phone clock alone never blocks: the server decides, and its rejection is kept for review', async () => {
    const { draft, view } = await openDraftOnline(new Date(Date.now() - 49 * 3600_000).toISOString())     // a misleading phone clock
    vi.mocked(team.recordAdvance).mockRejectedValueOnce(toAppError({ message: 'CAPTURE_TIME_TOO_OLD' }))
    view()
    await confirmWithPin()
    await waitFor(() => expect(team.recordAdvance).toHaveBeenCalledTimes(1))                             // sent: the server is the authority
    expect(vi.mocked(team.recordAdvance).mock.calls[0]![3]).toBe(draft.capturedAt)
    await waitFor(async () => expect((await readDraft(await store(), draft.draftId))?.payload.review?.code).toBe('CAPTURE_TIME_TOO_OLD'))
    expect((await readDraft(await store(), draft.draftId))?.state).toBe('draft')
    expect((await screen.findAllByText(/há mais de 48 horas/)).length).toBeGreaterThan(0)
  })
  it('a draft kept from before the device became support: the server refuses it (DEVICE_ONLINE_ONLY), kept for review', async () => {
    const { draft, view } = await openDraftOnline()
    vi.mocked(team.recordAdvance).mockRejectedValueOnce(toAppError({ message: 'DEVICE_ONLINE_ONLY' }))
    view()
    await confirmWithPin()
    await waitFor(async () => expect((await readDraft(await store(), draft.draftId))?.payload.review?.code).toBe('DEVICE_ONLINE_ONLY'))
    expect((await readDraft(await store(), draft.draftId))?.state).toBe('draft')
    expect((await screen.findAllByText(/passou a ser de apoio/)).length).toBeGreaterThan(0)
  })
  it('a server CAPTURE_TIME_IN_FUTURE is kept for review too', async () => {
    const { draft, view } = await openDraftOnline()
    vi.mocked(team.recordAdvance).mockRejectedValueOnce(toAppError({ message: 'CAPTURE_TIME_IN_FUTURE' }))
    view()
    await confirmWithPin()
    await waitFor(async () => expect((await readDraft(await store(), draft.draftId))?.payload.review?.code).toBe('CAPTURE_TIME_IN_FUTURE'))
  })
  it('discard asks first, then removes only this draft locally', async () => {
    const other = await saveDraft(await store(), 'advance', advanceForm(), { title: 'Ana', amount_minor: 1 })
    const { draft, view } = await openDraftOnline()
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar rascunho' }))
    expect(await screen.findByText('Descartar este rascunho?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(await screen.findByText('Lista de rascunhos')).toBeTruthy()
    expect(await readDraft(await store(), draft.draftId)).toBeNull()
    expect(await readDraft(await store(), other.draftId)).not.toBeNull()
    expect(team.recordAdvance).not.toHaveBeenCalled()
  })
})

describe('drafts list and reconnect', () => {
  it('lists each draft identifiably and opens it at its last step', async () => {
    online = true
    const s = await store()
    await saveDraft(s, 'advance', advanceForm(), { title: 'Ana', amount_minor: 1000000 })
    const e = await saveDraft(s, 'expense', { category: { id: C1, label: 'Água', hint: null }, amountMinor: 50000, payments: [{ method_id: M1, amount_minor: 50000 }], note: null },
      { title: 'Água', amount_minor: 50000 })
    const { markRejected } = await import('../../modules/movements/drafts')
    await markRejected(s, e.draftId, 'CATEGORY_INACTIVE')
    const { router } = renderScreen('/rascunhos', wrap(<DraftsPage />), { org: orgRow, routes: [{ path: '/dinheiro/despesa', element: <p>Despesa</p> }] })
    expect(await screen.findByText('Adiantamento · Ana')).toBeTruthy()
    const row = screen.getByText('Despesa · Água').closest('button')!
    expect(row.textContent).toMatch(/Precisa de revisão/)
    expect(row.textContent).toMatch(/500 Kz/)
    fireEvent.click(row)
    await waitFor(() => expect(router.state.location.search).toBe(`?rascunho=${e.draftId}&passo=3`))
  })
  it('a reconnect sends queued services only: movement drafts wait for a person and a PIN', async () => {
    const s = await store()
    const d = await saveDraft(s, 'advance', advanceForm(), { title: 'Ana', amount_minor: 1000000 })
    const submit = vi.fn()
    const drain = createServiceDrainer({ deviceContext: async () => ({ bound: true, organization: orgRow }), sessionPrincipal: async () => USER, submit, now: () => new Date() })
    renderScreen('/x', wrap(<p>App</p>, drain), { org: orgRow })
    await act(async () => { online = true; window.dispatchEvent(new Event('online')); await new Promise((r) => setTimeout(r, 50)) })
    expect(submit).not.toHaveBeenCalled()
    for (const f of [team.recordAdvance, money.recordExpense, purchasing.recordPurchase, org.verifyPerson]) expect(f).not.toHaveBeenCalled()
    expect((await readDraft(s, d.draftId))?.state).toBe('draft')
  })
})
