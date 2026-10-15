// Private mode + Fecho migration (UX slice 7): one nested, protected workspace. The real gate and routes, the
// database mocked at the edge: entering marks the area, moving inside it stays inside it, back never falls to Hoje,
// the explicit exit ends the context, decision flows are back-safe, and Anular from Fecho → Dinheiro stays private.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, type InitialEntry } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import type { Fecho, MoneyReview, PersonFigures } from '../../modules/period/api'

const rpc = vi.fn()
vi.mock('../../shared/supabase/client', () => ({ getSupabase: () => ({ rpc }) }))
vi.mock('../../modules/org/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/org/api')>()),
  listConfirmers: vi.fn().mockResolvedValue([{ id: 'm1', display_name: 'Mercy' }]),
  verifyPerson: vi.fn().mockResolvedValue('g1'),
}))
vi.mock('../../modules/period/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/period/api')>()),
  getFecho: vi.fn(), getMoneyReview: vi.fn(), closePeriod: vi.fn(), approvePeriod: vi.fn(), reopenPeriod: vi.fn(), annulApproval: vi.fn(), getRulePreview: vi.fn(),
  listFechoPeriods: vi.fn().mockResolvedValue([]), getFechoHistory: vi.fn().mockResolvedValue([]),
  getSyncStatus: vi.fn().mockResolvedValue({ ready: 0, pending: 0, silent: 0, safe: true }),
}))
vi.mock('../../modules/corrections/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/corrections/api')>()),
  getRecordSummary: vi.fn(), cancelRecord: vi.fn(),
}))
vi.mock('../../modules/team/situation', async (orig) => ({
  ...(await orig<typeof import('../../modules/team/situation')>()),
  listTeamPeople: vi.fn().mockResolvedValue([{ id: 'n', display_name: 'Nádia', capabilities: ['Cabelo'] }]),
}))
import { annulApproval, approvePeriod, closePeriod, getFecho, getMoneyReview, getRulePreview, getSyncStatus, reopenPeriod } from '../../modules/period/api'
import { cancelRecord, getRecordSummary } from '../../modules/corrections/api'
import { PrivateGate, PrivateHome } from '../../app/PrivateGate'
import { EquipaPage } from './EquipaPage'
import { PrivateEntryPage } from './PrivateEntryPage'
import { FechoHome } from '../fecho/FechoHome'
import { MoneyPage } from '../fecho/MoneyPage'
import { ClosePage } from '../fecho/ClosePage'
import { ApprovePage } from '../fecho/ApprovePage'
import { ReopenPage } from '../fecho/ReopenPage'
import { RuleFlow } from '../fecho/RuleFlow'
import { CancelRecordFlow } from '../registos/CancelRecordFlow'

const org = { id: 'o', name: 'Org', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const K = (kz: number) => kz * 100
// A real-length context (the gate's expiry timer must not overflow): five minutes from now.
const activeNow = () => ({ active: true, person_id: 'm1', display_name: 'Mercy', view: 'manager', business_health: false, catalogue_manage: false,
  expires_at: new Date(Date.now() + 300_000).toISOString() })
let status: unknown = activeNow()

const nadia: PersonFigures = {
  person_id: 'n', display_name: 'Nádia', is_owner: false, capabilities: [], production: { count: 10, total_minor: K(100000) },
  rule: { kind: 'standing', percent: 50, salon_percent: 50, decided: true, set_at: null, set_by: null },
  earned_minor: K(50000), advances: { count: 0, total_minor: 0 }, payments: { count: 0, total_minor: 0 }, contributions: { count: 0, total_minor: 0 },
  difference_minor: K(50000), remaining_minor: K(50000), excess_minor: 0, delivered_to_earned_minor: 0,
}
const carla: PersonFigures = { ...nadia, person_id: 'c', display_name: 'Carla', rule: { kind: 'contextual', percent: null, salon_percent: null, decided: false, set_at: null, set_by: null },
  earned_minor: null, difference_minor: null, remaining_minor: null, excess_minor: null, delivered_to_earned_minor: null }
function fecho(state: Fecho['period']['state'], over: Partial<Fecho> = {}, people: PersonFigures[] = [nadia]): Fecho {
  const pending = people.filter((x) => x.earned_minor === null)
  const paidLine = { person_id: 'n', display_name: 'Nádia', rule_kind: 'standing' as const, percent: 50, earned_minor: K(50000), advances_minor: 0, excess_minor: 0,
    approved_minor: K(50000), paid_minor: K(50000), outstanding_minor: 0, status: 'pago' as const,
    last: { amount_minor: K(50000), paid_at: '2026-11-02T09:15:00Z', method_label: 'Numerário', confirmed_by: 'Mercy' } }
  return {
    period: { id: 'p10', label: 'Outubro', state, starts_on: '2026-10-01', ends_on: '2026-10-31', is_current: true },
    review_revision: 7, calculation_version: 'v', source: 'live',
    position: {
      people, pending: pending.map((x) => ({ person_id: x.person_id, display_name: x.display_name })),
      production: { count: 10, total_minor: K(100000) }, team_earned_minor: K(50000), excess_minor: 0, payable_minor: K(50000), delivered_to_earned_minor: 0,
      advances_minor: 0, payments_minor: 0, expenses: { count: 1, total_minor: K(5000) }, purchases: { count: 0, total_minor: 0, contributions_minor: 0, salon_minor: 0 },
      reserve_allocated_minor: 0, reserve_used_minor: 0, sobra_minor: K(45000), livre_minor: pending.length ? null : K(45000),
      owners_decision: null, distribution_minor: null, undistributed_minor: null,
    },
    approval: state === 'aberto' ? null : { id: 'a', approved_at: '2026-11-01T08:02:00Z', approved_by: 'Mercy', review_revision: 7, total_minor: K(50000), cases: [],
      lines: [paidLine], paid_minor: K(50000), outstanding_minor: 0, payments_count: 1 },
    exceptions: pending.map((x) => ({ kind: 'rule_pending' as const, blocking: true as const, person: x })),
    readiness: { can_approve: state === 'aberto' && pending.length === 0, can_annul: false, can_pay: false, can_close: state === 'em_pagamento', unpaid_minor: 0 },
    closed: state === 'fechado' ? { closed_at: '2026-11-03T10:45:00Z', closed_by: 'Mercy', calculation_version: 'v', review_revision: 12 } : null,
    reopened: null, close_statements_count: 0, ...over,
  }
}
const money: MoneyReview = {
  expenses: [{ id: 'e1', occurred_at: '2026-10-05T10:00:00Z', category: 'Água', note: null, method: 'Numerário', amount_minor: K(5000), reserve_used_minor: 0 }],
  purchases: [], reserve: { allocated_minor: 0, used_minor: 0, balance_minor: 0, movements: [] },
}

function renderApp(entries: InitialEntry[], qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  const router = createMemoryRouter([
    { path: '/', element: <p>Ecrã Hoje</p> },
    { path: '/privado/entrar', element: <PrivateEntryPage /> },
    { path: '/dinheiro/despesa', element: <p>Registar despesa</p> },
    {
      path: '/privado', element: <PrivateGate />, children: [
        { index: true, element: <PrivateHome /> },
        { path: 'equipa', element: <EquipaPage /> },
        { path: 'situacao/:personId', element: <p>Situação</p> },
        { path: 'fecho', element: <FechoHome /> },
        { path: 'fecho/dinheiro', element: <MoneyPage /> },
        { path: 'fecho/fechar', element: <ClosePage /> },
        { path: 'fecho/aprovar', element: <ApprovePage /> },
        { path: 'fecho/reabrir', element: <ReopenPage /> },
        { path: 'fecho/regra/:personId', element: <RuleFlow /> },
        { path: 'anular/:kind/:recordId', element: <CancelRecordFlow area="private" /> },
      ],
    },
  ], { initialEntries: entries, initialIndex: entries.length - 1 })
  render(
    <QueryClientProvider client={qc}>
      <OrganizationContext.Provider value={org}><RouterProvider router={router} /></OrganizationContext.Provider>
    </QueryClientProvider>,
  )
  return { router, qc }
}
const ended = () => rpc.mock.calls.some(([fn]) => fn === 'end_private_context')
async function confirmAs() {
  fireEvent.click(await screen.findByRole('button', { name: 'Mercy' }))
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '135790' } })
}

beforeEach(() => {
  status = activeNow()
  rpc.mockReset().mockImplementation(async (fn: string) => {
    if (fn === 'private_context_status') return { data: status, error: null }
    if (fn === 'end_private_context') return { data: { ok: true }, error: null }
    if (fn === 'list_private_people') return { data: [{ id: 'm1', display_name: 'Mercy' }], error: null }
    if (fn === 'verify_person') { status = activeNow(); return { data: { ok: true }, error: null } }
    return { data: [], error: null }
  })
  vi.mocked(getFecho).mockReset().mockResolvedValue(fecho('aberto'))
  vi.mocked(getMoneyReview).mockReset().mockResolvedValue(money)
  vi.mocked(getRecordSummary).mockReset().mockResolvedValue({ kind: 'expense', occurred_at: '2026-10-05T10:00:00Z', amount_minor: K(5000), title: 'Água', person: null, cancelled: null })
  vi.mocked(cancelRecord).mockReset()
  vi.mocked(closePeriod).mockReset(); vi.mocked(reopenPeriod).mockReset(); vi.mocked(annulApproval).mockReset()
})

describe('private mode', () => {
  it('entering marks the area: the private bar says "Área privada · <who>"; the root offers × as the explicit exit', async () => {
    renderApp(['/', '/privado'])
    expect(await screen.findByText('Nádia')).toBeTruthy()
    const bar = document.querySelector('.app-bar')!
    expect(bar.className).toContain('app-bar-private')
    expect(bar.textContent).toContain('Área privada · Mercy')
    expect(within(bar as HTMLElement).getByRole('button', { name: 'Sair da área privada' })).toBeTruthy()
    for (const b of screen.getAllByRole('button')) expect(b.textContent ?? '').not.toMatch(/[←⌂🕒▾›×✓⋯]/u)
  })
  it('moving inside stays inside: Equipa → Fecho → ← returns to Equipa (history), never to Hoje; the context is not ended', async () => {
    const { router } = renderApp(['/', '/privado/equipa'])
    fireEvent.click(await screen.findByRole('button', { name: /Fecho do período/ }))
    expect(await screen.findByText('Outubro')).toBeTruthy()
    fireEvent.click(within(document.querySelector('.app-bar') as HTMLElement).getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByText('Nádia')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/privado/equipa')
    expect(router.state.historyAction).toBe('POP')
    expect(ended()).toBe(false)
  })
  it('a Fecho opened by a deep link goes back to the private root, not to Hoje', async () => {
    const { router } = renderApp(['/privado/fecho'])
    await screen.findByText('Outubro')
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/privado/equipa'))
    expect(screen.queryByText('Ecrã Hoje')).toBeNull()
  })
  it('the explicit exit (× on the root, "Sair" elsewhere) ends the context and lands on Hoje', async () => {
    const { router } = renderApp(['/', '/privado/equipa', '/privado/fecho'])
    await screen.findByText('Outubro')
    fireEvent.click(screen.getByRole('button', { name: 'Sair da área privada' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByText('Ecrã Hoje')).toBeTruthy()
    await waitFor(() => expect(ended()).toBe(true))
  })
})

describe('private session', () => {
  it('an ended context asks for the PIN again through the same entry and returns to the intended private screen', async () => {
    status = { active: false }
    const { router } = renderApp(['/', '/privado/fecho?p=p10'])
    expect(await screen.findByText('A área privada terminou. Confirme de novo para continuar.')).toBeTruthy()
    expect(router.state.location.state).toEqual({ ended: true, next: '/privado/fecho?p=p10' })
    fireEvent.click(await screen.findByRole('button', { name: 'Mercy' }))
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '135790' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Outubro')).toBeTruthy()
    expect(router.state.location.pathname + router.state.location.search).toBe('/privado/fecho?p=p10')
    expect(rpc).toHaveBeenCalledWith('verify_person', { p_person_id: 'm1', p_secret: '135790', p_scope: 'private_session' })
  })
})

describe('Fecho review and decisions', () => {
  it('exception first, the next valid action in the bottom bar', async () => {
    vi.mocked(getFecho).mockResolvedValue(fecho('aberto', {}, [nadia, carla]))
    renderApp(['/privado/fecho'])
    const attention = await screen.findByRole('region', { name: 'Precisa de atenção' })
    const row = within(attention).getByRole('button', { name: /Regra por definir/ })
    expect(within(row).getByText('Decidir').className).toBe('status-chip status-warning')
    expect(screen.getByRole('button', { name: 'Decidir regra · Carla' }).closest('.bottom-bar')).toBeTruthy()
  })
  it('every period state renders with its own next action', async () => {
    for (const [state, action] of [['aberto', 'Aprovar valores a pagar'], ['em_pagamento', 'Fechar período']] as const) {
      vi.mocked(getFecho).mockResolvedValue(fecho(state))
      const { router } = renderApp(['/privado/fecho'])
      expect((await screen.findByRole('button', { name: action })).closest('.bottom-bar')).toBeTruthy()
      router.dispose(); document.body.innerHTML = ''
    }
    vi.mocked(getFecho).mockResolvedValue(fecho('fechado', { exceptions: [] }))
    renderApp(['/privado/fecho'])
    expect(await screen.findByText('Só de leitura; reabrir exige autorização e motivo.')).toBeTruthy()
    expect(document.querySelector('.bottom-bar')).toBeNull()                                 // read-only: no bar action
    const reopen = screen.getByRole('button', { name: 'Reabrir período (autorização necessária)' })
    expect(reopen.className).toBe('btn btn-destructive')
  })
  it('Fechar período is a primary completion action; after it, back to the Fecho home with no close screen behind', async () => {
    vi.mocked(getFecho).mockResolvedValue(fecho('em_pagamento'))
    vi.mocked(closePeriod).mockImplementation(async () => { vi.mocked(getFecho).mockResolvedValue(fecho('fechado', { exceptions: [] })); return { review_revision: 13 } })
    const { router } = renderApp(['/privado/equipa', '/privado/fecho'])
    fireEvent.click(await screen.findByRole('button', { name: 'Fechar período' }))
    await confirmAs()
    const final = await screen.findByRole('button', { name: 'Fechar período' })
    expect(final.className).toBe('btn btn-primary btn-tall')
    expect(final.closest('.bottom-bar')).toBeTruthy()
    fireEvent.click(final)
    expect(await screen.findByText('Só de leitura; reabrir exige autorização e motivo.')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/privado/fecho')
    expect(router.state.historyAction).toBe('POP')                                           // the close screen was popped, not stacked
    expect(vi.mocked(closePeriod).mock.calls[0]![2]).toEqual({ periodId: 'p10', revision: 7 })
  })
  it('Reabrir: a typed reason is not dropped by back; the final action is destructive; success leaves no reopen screen', async () => {
    vi.mocked(getFecho).mockResolvedValue(fecho('fechado', { exceptions: [] }))
    vi.mocked(reopenPeriod).mockImplementation(async () => { vi.mocked(getFecho).mockResolvedValue(fecho('em_pagamento')); return { review_revision: 13, state: 'em_pagamento' } })
    const { router } = renderApp(['/privado/equipa', '/privado/fecho'])
    fireEvent.click(await screen.findByRole('button', { name: 'Reabrir período (autorização necessária)' }))
    fireEvent.change(await screen.findByLabelText('Motivo (obrigatório)'), { target: { value: 'Pagamento em falta' } })
    await act(() => router.navigate(-1))
    expect(await screen.findByRole('dialog', { name: 'Sair sem reabrir?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a editar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((screen.getByLabelText('Motivo (obrigatório)') as HTMLInputElement).value).toBe('Pagamento em falta')
    await confirmAs()
    const final = screen.getByRole('button', { name: 'Reabrir período' })
    expect(final.className).toContain('btn-danger')
    fireEvent.click(final)
    await waitFor(() => expect(reopenPeriod).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: 'Fechar período' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/privado/fecho')
    expect(router.state.historyAction).toBe('POP')
    expect(vi.mocked(reopenPeriod).mock.calls[0]![2]).toEqual({ periodId: 'p10', revision: 7, reason: 'Pagamento em falta' })
  })
  it('Anular aprovação: a destructive entry; its sheet closes with back and changes nothing', async () => {
    vi.mocked(getFecho).mockResolvedValue({ ...fecho('pronto_para_pagamento'), readiness: { can_approve: false, can_annul: true, can_pay: true, can_close: false, unpaid_minor: 0 } })
    const { router } = renderApp(['/privado/fecho'])
    const entry = await screen.findByRole('button', { name: 'Voltar a rever (anula a aprovação)' })
    expect(entry.className).toBe('btn btn-destructive')
    expect(entry.closest('.bottom-bar')).toBeNull()                                          // never the bar's action
    fireEvent.click(entry)
    const sheet = await screen.findByRole('dialog', { name: /Voltar a rever/ })
    expect(within(sheet).getByRole('button', { name: 'Anular aprovação' }).className).toContain('btn-danger')
    await act(() => router.navigate(-1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/privado/fecho')
    expect(annulApproval).not.toHaveBeenCalled()
  })
  it('RuleFlow: Confirmação is its own entry, keeping the period (?p=) — back returns to the typed percentage', async () => {
    const preview = { person: { ...carla, earned_minor: K(40000), remaining_minor: K(40000), difference_minor: K(40000), excess_minor: 0 }, current: carla, base_minor: K(95000),
      after: { sobra_minor: K(55000), livre_minor: K(55000), pending: [], distribution_minor: null, undistributed_minor: null, owners_decision: null }, history: [] }
    vi.mocked(getFecho).mockResolvedValue(fecho('aberto', {}, [nadia, carla]))
    vi.mocked(getRulePreview).mockReset().mockResolvedValue(preview)
    const { router } = renderApp(['/privado/fecho?p=p10', '/privado/fecho/regra/c?p=p10'])
    fireEvent.change(await screen.findByLabelText('Percentagem para Carla'), { target: { value: '40' } })
    await waitFor(() => expect((screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText('Confirmação necessária')).toBeTruthy()
    expect(new URLSearchParams(router.state.location.search).get('p')).toBe('p10')          // the period stays with the step
    expect(new URLSearchParams(router.state.location.search).get('passo')).toBe('2')
    expect(vi.mocked(getFecho).mock.calls.every(([p]) => p === 'p10')).toBe(true)          // never fell back to another period
    await act(() => router.navigate(-1))
    expect(((await screen.findByLabelText('Percentagem para Carla')) as HTMLInputElement).value).toBe('40')
    expect(router.state.location.pathname).toBe('/privado/fecho/regra/c')
  })
})

describe('Anular from Fecho → Dinheiro stays in the private area', () => {
  it('row → sheet → Anular registo opens inside the gate; back returns to Dinheiro and the context is never ended', async () => {
    const { router } = renderApp(['/privado/fecho', '/privado/fecho/dinheiro'])
    fireEvent.click(await screen.findByRole('button', { name: /Água/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Água' })
    const anular = within(sheet).getByRole('button', { name: 'Anular registo' })
    expect(anular.className).toBe('btn btn-destructive')
    fireEvent.click(anular)
    await waitFor(() => expect(router.state.location.pathname).toBe('/privado/anular/expense/e1'))
    expect(await screen.findByTestId('cancel-what')).toBeTruthy()
    expect(document.querySelector('.app-bar')!.textContent).toContain('Área privada · Mercy')
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByText('Movimentos para a equipa')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/privado/fecho/dinheiro')
    expect(ended()).toBe(false)
  })
  it('after the correction, "Voltar" returns to Dinheiro, still private; nothing ended the context', async () => {
    vi.mocked(cancelRecord).mockResolvedValue({ cancellation_id: 'c1', cancelled_at: '2026-10-07T09:20:00Z' })
    const { router } = renderApp(['/privado/fecho', '/privado/fecho/dinheiro', '/privado/anular/expense/e1'])
    fireEvent.change(await screen.findByLabelText('Motivo (obrigatório)'), { target: { value: 'Duplicada' } })
    await confirmAs()
    fireEvent.click(screen.getByRole('button', { name: 'Anular registo' }))
    expect(await screen.findByText('Registo anulado.')).toBeTruthy()
    expect(screen.getByText('Registar de novo abre o registo normal e sai da área privada.')).toBeTruthy()
    fireEvent.click(within(document.querySelector('.bottom-bar') as HTMLElement).getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/privado/fecho/dinheiro'))
    expect(ended()).toBe(false)
    expect(vi.mocked(cancelRecord).mock.calls[0]![2]).toEqual({ kind: 'expense', recordId: 'e1', reason: 'Duplicada' })
  })
})

describe('Fecho offline sync gate (Offline 7)', () => {
  const unsafe = { ready: 1, pending: 1, silent: 1, safe: false }
  const safe = { ready: 3, pending: 0, silent: 0, safe: true }
  it('a period not synchronized on every phone: calm notice, controls blocked, status sheet — and no command sent', async () => {
    vi.mocked(getFecho).mockResolvedValue(fecho('em_pagamento'))
    vi.mocked(getSyncStatus).mockResolvedValue(unsafe)
    renderApp(['/privado/fecho', '/privado/fecho/fechar'])
    expect((await screen.findByTestId('sync-notice')).textContent).toMatch(/Há registos offline por sincronizar antes de fechar este período\.2 telemóveis ainda precisam de atenção/)
    expect(screen.queryByLabelText('PIN')).toBeNull()
    expect((screen.getByRole('button', { name: 'Fechar período' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver estado da sincronização' })[0]!)
    const rows = [...(await screen.findByTestId('sync-gate-status')).querySelectorAll('div')].map((d) => d.textContent)
    expect(rows).toEqual(['Sincronizados para este período1 telemóvel', 'Com registos por enviar, confirmar ou rever1 telemóvel', 'Sem notícias desde o fim do período1 telemóvel'])
    expect(document.body.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)                   // no device ids
    vi.mocked(getSyncStatus).mockResolvedValue(safe)
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    await waitFor(() => expect(screen.queryByTestId('sync-notice')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await confirmAs()
    expect((screen.getByRole('button', { name: 'Fechar período' }) as HTMLButtonElement).disabled).toBe(false)
    expect(closePeriod).not.toHaveBeenCalled()
  })
  it('approval is gated the same way', async () => {
    vi.mocked(getFecho).mockResolvedValue(fecho('aberto'))
    vi.mocked(getSyncStatus).mockResolvedValue(unsafe)
    renderApp(['/privado/fecho', '/privado/fecho/aprovar'])
    expect((await screen.findByTestId('sync-notice')).textContent).toMatch(/antes de aprovar este período/)
    expect(screen.queryByLabelText('PIN')).toBeNull()
    expect(approvePeriod).not.toHaveBeenCalled()
  })
  it('the server is the authority: its refusal is shown even when the screen thought it was safe', async () => {
    vi.mocked(getFecho).mockResolvedValue(fecho('em_pagamento'))
    vi.mocked(getSyncStatus).mockResolvedValue(safe)
    const { AppError } = await import('../../shared/errors')
    vi.mocked(closePeriod).mockRejectedValue(new AppError('domain', 'PERIOD_OFFLINE_SYNC_PENDING', 'PERIOD_OFFLINE_SYNC_PENDING'))
    renderApp(['/privado/fecho', '/privado/fecho/fechar'])
    await confirmAs()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar período' }))
    expect(await screen.findByText(/Há registos offline por sincronizar neste período/)).toBeTruthy()
  })
})

