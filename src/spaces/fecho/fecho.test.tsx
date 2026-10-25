import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import { AppError } from '../../shared/errors'
import type { ApprovalLine, Fecho, PersonFigures, RulePreview } from '../../modules/period/api'

vi.mock('../../modules/org/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/org/api')>()),
  listConfirmers: vi.fn().mockResolvedValue([{ id: 'm1', display_name: 'Mercy' }]),
  verifyPerson: vi.fn().mockResolvedValue('g1'),
}))
vi.mock('../../modules/services/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/services/api')>()),
  listPaymentMethods: vi.fn().mockResolvedValue([{ id: 'cash', code: 'numerario', label: 'Numerário' }, { id: 'tr', code: 'transferencia', label: 'Transferência' }]),
}))
vi.mock('../../modules/period/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/period/api')>()),
  getFecho: vi.fn(), approvePeriod: vi.fn(), closePeriod: vi.fn(), confirmPayment: vi.fn(), getFechoHistory: vi.fn(), listFechoPeriods: vi.fn().mockResolvedValue([]), reopenPeriod: vi.fn(), getRulePreview: vi.fn(),
  declareWeekEnd: vi.fn(), withdrawWeekEnd: vi.fn(),
}))
import { approvePeriod, closePeriod, confirmPayment, declareWeekEnd, getFecho, getFechoHistory, getRulePreview, reopenPeriod, withdrawWeekEnd, type WeekEnd } from '../../modules/period/api'
import { RuleFlow } from './RuleFlow'
import { ReopenPage } from './ReopenPage'
import { FechoHome } from './FechoHome'
import { ProfessionalsPage } from './ProfessionalsPage'
import { ApprovePage } from './ApprovePage'
import { PaymentsPage } from './PaymentsPage'
import { ClosePage, HistoryPage } from './ClosePage'

const org = { id: 'o', name: 'Org', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const K = (kz: number) => kz * 100
const person = (id: string, name: string, earned: number | null, adv: number, over: Partial<PersonFigures> = {}): PersonFigures => ({
  person_id: id, display_name: name, is_owner: false, capabilities: [], production: { count: 10, total_minor: K(earned === null ? 64000 : earned * 2) },
  rule: { kind: earned === null ? 'contextual' : 'standing', percent: earned === null ? null : 50, salon_percent: earned === null ? null : 50, decided: earned !== null, set_at: null, set_by: null },
  earned_minor: earned === null ? null : K(earned), advances: { count: adv ? 1 : 0, total_minor: K(adv) }, payments: { count: 0, total_minor: 0 },
  contributions: { count: 0, total_minor: 0 },
  difference_minor: earned === null ? null : K(earned - adv), remaining_minor: earned === null ? null : K(Math.max(earned - adv, 0)),
  excess_minor: earned === null ? null : K(Math.max(adv - earned, 0)), delivered_to_earned_minor: earned === null ? null : K(Math.min(adv, earned)), ...over,
})
const nadia = person('n', 'Nádia', 70000, 25000), laurindo = person('l', 'Laurindo', 29000, 35000), carla = person('c', 'Carla', null, 10000)
function fecho(over: Partial<Fecho> = {}, people = [nadia, laurindo, carla]): Fecho {
  const pending = people.filter((x) => x.earned_minor === null)
  return {
    period: { id: 'p10', label: 'Outubro', state: 'aberto', starts_on: '2026-10-01', ends_on: '2026-10-31', is_current: true },
    review_revision: 7, calculation_version: '2026-10.1', source: 'live',
    position: {
      people, pending: pending.map((x) => ({ person_id: x.person_id, display_name: x.display_name })),
      production: { count: 30, total_minor: K(300000) }, team_earned_minor: K(99000), excess_minor: K(6000), payable_minor: K(45000),
      delivered_to_earned_minor: K(54000), advances_minor: K(70000), payments_minor: 0,
      expenses: { count: 4, total_minor: K(23500) }, purchases: { count: 2, total_minor: K(29000), contributions_minor: K(8500), salon_minor: K(20500) },
      reserve_allocated_minor: K(20000), reserve_used_minor: 0, sobra_minor: K(131000), livre_minor: pending.length ? null : K(60000),
      owners_decision: null, distribution_minor: null, undistributed_minor: null,
    },
    approval: null,
    exceptions: [...pending.map((x) => ({ kind: 'rule_pending' as const, blocking: true as const, person: x })),
      ...people.filter((x) => (x.excess_minor ?? 0) > 0).map((x) => ({ kind: 'above_earned' as const, blocking: false as const, person: x }))],
    readiness: { can_approve: pending.length === 0, can_annul: false, can_pay: false, can_close: false, unpaid_minor: 0 },
    closed: null, reopened: null, close_statements_count: 0, ...over,
  }
}
const line = (id: string, name: string, approved: number, paid = 0): ApprovalLine => ({
  person_id: id, display_name: name, rule_kind: 'standing', percent: 50, earned_minor: K(approved), advances_minor: 0, excess_minor: 0,
  approved_minor: K(approved), paid_minor: K(paid), outstanding_minor: K(approved - paid),
  status: approved === 0 ? 'nada_a_pagar' : paid === 0 ? 'por_pagar' : paid < approved ? 'parcial' : 'pago',
  last: paid ? { amount_minor: K(paid), paid_at: '2026-11-02T09:15:00Z', method_label: 'Transferência', confirmed_by: 'Mercy' } : null,
})
const approved = (lines: ApprovalLine[], state: Fecho['period']['state'] = 'pronto_para_pagamento'): Fecho => {
  const base = fecho({}, [nadia, laurindo, person('c', 'Carla', 32000, 10000)])
  const outstanding = lines.reduce((s, l) => s + l.outstanding_minor, 0)
  return { ...base, period: { ...base.period, state }, exceptions: lines.filter((l) => l.outstanding_minor > 0).map((l) => ({ kind: 'payment_pending', blocking: false, line: l })),
    approval: { id: 'a', approved_at: '2026-11-01T08:02:00Z', approved_by: 'Fernando', review_revision: 7, total_minor: lines.reduce((s, l) => s + l.approved_minor, 0),
      cases: [], lines, paid_minor: lines.reduce((s, l) => s + l.paid_minor, 0), outstanding_minor: outstanding, payments_count: 0 },
    readiness: { can_approve: false, can_annul: false, can_pay: outstanding > 0, can_close: outstanding === 0, unpaid_minor: outstanding } }
}
// A data router (the back contract's useBlocker needs one), with the Fecho routes; returns it so tests can drive back.
function renderAt(path: string, entries?: string[]) {
  const router = createMemoryRouter([
    { path: '/privado/fecho', element: <FechoHome /> },
    { path: '/privado/fecho/profissionais', element: <ProfessionalsPage /> },
    { path: '/privado/fecho/aprovar', element: <ApprovePage /> },
    { path: '/privado/fecho/pagamentos', element: <PaymentsPage /> },
    { path: '/privado/fecho/fechar', element: <ClosePage /> },
    { path: '/privado/fecho/historico', element: <HistoryPage /> },
    { path: '/privado/fecho/reabrir', element: <ReopenPage /> },
    { path: '/privado/fecho/regra/:personId', element: <RuleFlow /> },
    { path: '*', element: <p>Outro ecrã</p> },
  ], { initialEntries: entries ?? [path], initialIndex: entries ? entries.length - 1 : 0 })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <OrganizationContext.Provider value={org}><RouterProvider router={router} /></OrganizationContext.Provider>
    </QueryClientProvider>,
  )
  return router
}
async function confirmAs() {
  fireEvent.click(await screen.findByRole('button', { name: 'Mercy' }))
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '135790' } })
}

beforeEach(() => { vi.mocked(getFecho).mockReset(); vi.mocked(approvePeriod).mockReset(); vi.mocked(closePeriod).mockReset(); vi.mocked(confirmPayment).mockReset() })

describe('Fecho home', () => {
  it('readiness and exceptions: blocked while a rule is pending; the first blocking item is the next action', async () => {
    vi.mocked(getFecho).mockResolvedValue(fecho())
    renderAt('/privado/fecho')
    expect(await screen.findByText('Ainda não pode aprovar')).toBeTruthy()
    const attention = screen.getByRole('region', { name: 'Precisa de atenção' })
    expect(within(attention).getByText('Regra por definir')).toBeTruthy()
    expect(within(attention).getByText('Acima do ganho')).toBeTruthy()
    expect(screen.getByTestId('state-strip').textContent).toBe('Abertodepois: Pronto para pagamento')
    expect(screen.getByText('livre para os sócios — · 1 regra por definir')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Decidir regra · Carla' })).toBeTruthy()
  })
  it('ready to approve once every rule is defined', async () => {
    vi.mocked(getFecho).mockResolvedValue(fecho({}, [nadia, laurindo]))
    renderAt('/privado/fecho')
    expect(await screen.findByText('Pronto para aprovar')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aprovar valores a pagar' })).toBeTruthy()
  })
  it('closed: lock card, a summary that adds up, and only the authorized reopen', async () => {
    const f = approved([line('n', 'Nádia', 45000, 45000)], 'fechado')
    vi.mocked(getFecho).mockResolvedValue({ ...f, source: 'close_statement', exceptions: [], closed: { closed_at: '2026-11-03T10:45:00Z', closed_by: 'Mercy', calculation_version: '2026-10.1', review_revision: 12 } })
    renderAt('/privado/fecho')
    expect(await screen.findByText('Fechado em 3 nov às 11:45 por Mercy')).toBeTruthy()
    expect(screen.getByText('Só de leitura; reabrir exige autorização e motivo.')).toBeTruthy()
    expect(screen.getByText('Sem decisão registada ao fechar')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Fechar período|Aprovar|Confirmar pagamentos/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reabrir período (autorização necessária)' }).className).toContain('btn-destructive')
  })
})

describe('Profissionais', () => {
  it('pending rule shows "—", never 0, and blocks approval with the reason', async () => {
    vi.mocked(getFecho).mockResolvedValue(fecho())
    renderAt('/privado/fecho/profissionais')
    const carlaRow = (await screen.findByText('Carla')).closest('button')!
    expect(within(carlaRow).getByText('—')).toBeTruthy()
    expect(within(carlaRow).getByText('Decidir')).toBeTruthy()
    expect(screen.getByText('50% · ganho 29.000 − adiant. 35.000 = −6.000 · nada a pagar')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Aprovar valores a pagar' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Defina as regras de Carla para aprovar.')).toBeTruthy()
  })
})

describe('approval', () => {
  it('submits the reviewed revision; a stale review warns, refreshes and approves the new revision', async () => {
    vi.mocked(getFecho).mockResolvedValueOnce(fecho({}, [nadia, laurindo])).mockResolvedValue(fecho({ review_revision: 8 }, [nadia, laurindo]))
    vi.mocked(approvePeriod).mockRejectedValueOnce(new AppError('domain', 'STALE_REVIEW', 'STALE_REVIEW')).mockResolvedValueOnce({ review_revision: 9, total_minor: K(45000) })
    renderAt('/privado/fecho/aprovar')
    expect(await screen.findByText('Casos a rever nesta aprovação')).toBeTruthy()
    expect(screen.getByText('Laurindo · adiantamentos 35.000 acima do ganho 29.000 · nada a pagar')).toBeTruthy()
    await confirmAs()
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar 45.000 Kz' }))
    expect(await screen.findByText(/Os valores mudaram desde que os reviu/)).toBeTruthy()
    await waitFor(() => expect(getFecho).toHaveBeenCalledTimes(2))
    expect(vi.mocked(approvePeriod).mock.calls[0]![2]).toEqual({ periodId: 'p10', revision: 7 })
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar 45.000 Kz' }))
    await waitFor(() => expect(approvePeriod).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Pronto para aprovar')).toBeTruthy()                  // back on the Fecho home
    expect(vi.mocked(approvePeriod).mock.calls[1]![2]).toEqual({ periodId: 'p10', revision: 8 })
    expect(vi.mocked(approvePeriod).mock.calls[1]![0]).not.toBe(vi.mocked(approvePeriod).mock.calls[0]![0])   // a new intent
  })
})

describe('payments', () => {
  it('a lower amount warns (Parcial) with Repor; a higher one is blocked; the payment is confirmed', async () => {
    vi.mocked(getFecho).mockResolvedValue(approved([line('n', 'Nádia', 45000), line('l', 'Laurindo', 0)]))
    vi.mocked(confirmPayment).mockResolvedValue({ review_revision: 9, outstanding_minor: K(15000), paid_at: '' })
    renderAt('/privado/fecho/pagamentos')
    expect((await screen.findByTestId('payment-totals')).textContent).toContain('45.000 Kz')
    fireEvent.click(screen.getByText('Nádia').closest('button')!)
    fireEvent.change(screen.getByLabelText('Valor pago'), { target: { value: '50000' } })
    expect(screen.getByText('Não pode pagar mais do que está aprovado (45.000 Kz).')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Valor pago'), { target: { value: '30000' } })
    expect(screen.getByText(/Ficam por pagar 15.000 Kz a Nádia/)).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Transferência' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar mesmo assim' }))
    await confirmAs()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }))
    await waitFor(() => expect(confirmPayment).toHaveBeenCalled())
    expect(vi.mocked(confirmPayment).mock.calls[0]![2]).toEqual({ periodId: 'p10', personId: 'n', amountMinor: K(30000), methodId: 'tr' })
  })
})

describe('close', () => {
  it('is blocked while approved amounts are unpaid, with the way out', async () => {
    vi.mocked(getFecho).mockResolvedValue(approved([line('n', 'Nádia', 45000, 45000), line('f', 'Fernando', 39000)], 'em_pagamento'))
    renderAt('/privado/fecho/fechar')
    expect(await screen.findByText('Ainda há 1 pagamento por confirmar')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Fechar período' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Ir aos pagamentos' })).toBeTruthy()
    expect(screen.queryByLabelText('PIN')).toBeNull()
  })
  it('closes with the reviewed revision when everything approved is paid; warns without an owners decision', async () => {
    vi.mocked(getFecho).mockResolvedValue(approved([line('n', 'Nádia', 45000, 45000)], 'em_pagamento'))
    vi.mocked(closePeriod).mockResolvedValue({ review_revision: 13 })
    renderAt('/privado/fecho/fechar')
    expect(await screen.findByText('Ainda sem decisão dos sócios: fica registado «sem decisão» ao fechar.')).toBeTruthy()
    await confirmAs()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar período' }))
    await waitFor(() => expect(closePeriod).toHaveBeenCalled())
    expect(vi.mocked(closePeriod).mock.calls[0]![2]).toEqual({ periodId: 'p10', revision: 7 })
  })
})

describe('history', () => {
  it('lists the close decisions newest first with who', async () => {
    vi.mocked(getFecho).mockResolvedValue(fecho())
    vi.mocked(getFechoHistory).mockResolvedValue([
      { kind: 'close', at: '2026-11-03T10:45:00Z', by: 'Mercy', payments_count: 3, paid_minor: K(106000), distribution_minor: K(40000) },
      { kind: 'rule', at: '2026-10-31T17:20:00Z', by: 'Mercy', person: 'Carla', percent: 40, previous_percent: 50 },
      { kind: 'cancellation', at: '2026-10-31T17:15:00Z', by: 'Mercy', reason: 'Valor errado', record_kind: 'service', record: { title: 'Corte', person: 'Nádia', amount_minor: K(3500) } },
      { kind: 'rule', at: '2026-10-31T17:12:00Z', by: 'Mercy', person: 'Carla', percent: 50, previous_percent: null },
    ])
    renderAt('/privado/fecho/historico')
    expect(await screen.findByText('Período fechado')).toBeTruthy()
    expect(screen.getByText('3 pagamentos · 106.000 Kz · distribuição 40.000 Kz · fechado por Mercy')).toBeTruthy()
    expect(screen.getByText('Regra alterada · Carla')).toBeTruthy()
    expect(screen.getByText('de 50% para 40% · por Mercy')).toBeTruthy()
    expect(screen.getByText('Registo anulado · Serviço')).toBeTruthy()
    expect(screen.getByText('Corte · Nádia · 3.500 Kz · motivo: Valor errado · anulado por Mercy')).toBeTruthy()
    expect(screen.getAllByTestId('history-day')).toHaveLength(2)
  })
})

describe('reopen', () => {
  const closedFecho = () => {
    const f = approved([line('n', 'Nádia', 45000, 45000)], 'fechado')
    return { ...f, source: 'close_statement' as const, exceptions: [], close_statements_count: 1,
      closed: { closed_at: '2026-11-03T10:45:00Z', closed_by: 'Mercy', calculation_version: '2026-10.1', review_revision: 12 } }
  }
  it('needs a reason, then confirms with the reviewed revision', async () => {
    vi.mocked(getFecho).mockResolvedValue(closedFecho())
    vi.mocked(reopenPeriod).mockResolvedValue({ review_revision: 13, state: 'em_pagamento' })
    renderAt('/privado/fecho/reabrir')
    expect(await screen.findByText('Escreva o motivo para continuar.')).toBeTruthy()
    expect(screen.queryByLabelText('PIN')).toBeNull()
    fireEvent.change(screen.getByLabelText('Motivo (obrigatório)'), { target: { value: '  Distribuição com valor errado ' } })
    expect(screen.getByText('3 nov às 11:45 por Mercy')).toBeTruthy()
    await confirmAs()
    expect(screen.getByRole('button', { name: 'Reabrir período' }).className).toContain('btn-danger')   // undoes a close: destructive
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir período' }))
    await waitFor(() => expect(reopenPeriod).toHaveBeenCalled())
    expect(vi.mocked(reopenPeriod).mock.calls[0]![2]).toEqual({ periodId: 'p10', revision: 7, reason: 'Distribuição com valor errado' })
  })
  it('a reopened period says who reopened it, when and why', async () => {
    const f = approved([line('n', 'Nádia', 45000, 45000)], 'em_pagamento')
    vi.mocked(getFecho).mockResolvedValue({ ...f, close_statements_count: 1, reopened: { at: '2026-11-04T08:30:00Z', by: 'Mercy', reason: 'distribuição aos sócios registada com valor errado', to_state: 'em_pagamento' } })
    renderAt('/privado/fecho')
    expect(await screen.findByText('Todos os pagamentos confirmados')).toBeTruthy()
    expect(screen.getByText(/Reaberto por Mercy · 4 nov 09:30 · motivo: distribuição aos sócios registada com valor errado./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fechar período' })).toBeTruthy()
  })
})

describe('RuleFlow states: typing never replaces the screen', () => {
  const previewFor = (pct: number | null): RulePreview => ({
    person: pct === null ? carla : person('c', 'Carla', 32000, 10000), current: carla, base_minor: K(131000),
    after: { sobra_minor: K(pct === null ? 131000 : 99000), livre_minor: null, pending: pct === null ? [{ person_id: 'c', display_name: 'Carla' }] : [],
             distribution_minor: null, undistributed_minor: null, owners_decision: null },
    history: [],
  })
  function deferred<T>() { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
  const percentInput = async () => await screen.findByLabelText('Percentagem para Carla') as HTMLInputElement
  const continuar = () => screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement

  it('a keystroke keeps the input (focused, with its value) and the previous preview, dimmed and busy, until the new one arrives', async () => {
    vi.mocked(getFecho).mockResolvedValue(fecho())
    const d = deferred<RulePreview>()
    vi.mocked(getRulePreview).mockReset().mockResolvedValueOnce(previewFor(null)).mockReturnValueOnce(d.promise)
    renderAt('/privado/fecho/regra/c')
    const input = await percentInput()
    input.focus()
    fireEvent.change(input, { target: { value: '40' } })
    expect(screen.queryByText('A carregar…')).toBeNull()                            // the screen stays
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('40')
    const effect = await screen.findByTestId('rule-effect')
    expect(effect.getAttribute('aria-busy')).toBe('true')
    expect(within(effect).getByText('A recalcular…')).toBeTruthy()
    expect(continuar().disabled).toBe(true)                                           // never confirm a stale preview
    await act(async () => { d.resolve(previewFor(40)) })
    await waitFor(() => expect(screen.getByTestId('rule-effect').getAttribute('aria-busy')).toBeNull())
    expect(within(screen.getByTestId('rule-effect')).getByText(/32\.000 Kz = 40% × 64\.000/)).toBeTruthy()   // the new figures
    expect(continuar().disabled).toBe(false)
    expect(document.activeElement).toBe(input)
    expect(vi.mocked(getRulePreview).mock.calls.map((c) => c[2])).toEqual([null, 40])
  })
  it('a failed recalculation keeps the screen and the previous figures, says so and offers Retry', async () => {
    vi.mocked(getFecho).mockResolvedValue(fecho())
    vi.mocked(getRulePreview).mockReset().mockResolvedValueOnce(previewFor(null)).mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(previewFor(40))
    renderAt('/privado/fecho/regra/c')
    const input = await percentInput()
    fireEvent.change(input, { target: { value: '40' } })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Não foi possível calcular esta regra.')
    expect(screen.getByLabelText('Percentagem para Carla')).toBeTruthy()
    expect(continuar().disabled).toBe(true)
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(await within(screen.getByTestId('rule-effect')).findByText(/32\.000 Kz = 40% × 64\.000/)).toBeTruthy()
    expect(continuar().disabled).toBe(false)
  })
})

// Slice 2 · Terminar a semana (ADR-0010 §5 amendment). Salão Agradável-like schedule: Saturday, usual closing 20:00
// Africa/Luanda (19:00 UTC). Only the clock is faked, so the query library's timers run as usual.
describe('Terminar a semana', () => {
  const week = (over: Partial<WeekEnd> = {}): WeekEnd => ({
    available: true, last_operating_day: '2026-10-24', usual_closing_at: '2026-10-24T19:00:00Z', calendar_end: '2026-10-25T23:00:00Z',
    declared: null, ended: false, ended_by: null, too_early: false, can_declare: true, can_withdraw: false, ...over,
  })
  const weekFecho = (we: WeekEnd) => {
    const base = fecho({}, [nadia, laurindo])
    return { ...base, period: { ...base.period, label: 'Semana 19/10–25/10', starts_on: '2026-10-19', ends_on: '2026-10-25' }, week_end: we }
  }
  const sheet = () => screen.getByRole('dialog')
  beforeEach(() => { vi.mocked(declareWeekEnd).mockReset(); vi.mocked(withdrawWeekEnd).mockReset() })
  afterEach(() => vi.useRealTimers())

  it('Saturday before the usual closing time: the week is open, ending it asks first; "Continuar aberto" changes nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-24T17:30:00Z'))      // 18:30 in Luanda
    vi.mocked(getFecho).mockResolvedValue(weekFecho(week()))
    vi.mocked(declareWeekEnd).mockResolvedValue({ review_revision: 8, declared_at: '2026-10-24T17:31:00Z', early: true })
    renderAt('/privado/fecho')
    const notice = await screen.findByTestId('week-end-notice')
    expect(notice.textContent).toMatch(/^A semana ainda não foi terminada/)
    expect(within(notice).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Terminar a semana', 'Cada telemóvel envia o que tem guardado', 'Aprovar os valores'])
    expect(screen.queryByText('Pronto para aprovar')).toBeNull()                                   // the week comes first
    fireEvent.click(screen.getByRole('button', { name: 'Terminar a semana' }))
    const warning = within(sheet()).getByTestId('early-warning')
    expect(warning.textContent).toMatch(/O salão normalmente funciona até às 20:00\.Tem a certeza de que o expediente desta semana terminou\?/)
    expect(within(sheet()).queryByLabelText('PIN')).toBeNull()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Continuar aberto' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(declareWeekEnd).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Terminar a semana' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Terminar a semana' }))            // yes, the week is over
    await confirmAs()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Terminar a semana' }))
    await waitFor(() => expect(declareWeekEnd).toHaveBeenCalledTimes(1))
    expect(vi.mocked(declareWeekEnd).mock.calls[0]![2]).toEqual({ periodId: 'p10' })
  })
  it('Saturday after the usual closing time: straight to the confirmation, no question', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-24T19:30:00Z'))      // 20:30 in Luanda
    vi.mocked(getFecho).mockResolvedValue(weekFecho(week()))
    vi.mocked(declareWeekEnd).mockResolvedValue({ review_revision: 8, declared_at: '2026-10-24T19:30:00Z', early: false })
    renderAt('/privado/fecho')
    fireEvent.click(await screen.findByRole('button', { name: 'Terminar a semana' }))
    expect(within(sheet()).queryByTestId('early-warning')).toBeNull()
    await confirmAs()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Terminar a semana' }))
    await waitFor(() => expect(declareWeekEnd).toHaveBeenCalledTimes(1))
  })
  it('before the last operating day: says when the week can be ended, and offers no way to end it', async () => {
    vi.mocked(getFecho).mockResolvedValue(weekFecho(week({ too_early: true, can_declare: false })))
    renderAt('/privado/fecho')
    expect((await screen.findByTestId('week-end-notice')).textContent).toMatch(/^A semana ainda está a decorrerPode terminar a semana a partir de sábado, 24 out/)
    expect(screen.queryByRole('button', { name: 'Terminar a semana' })).toBeNull()
  })
  it('after the declaration: when, by whom, early; approval is next; "Continuar a semana" withdraws it', async () => {
    vi.mocked(getFecho).mockResolvedValue(weekFecho(week({ declared: { at: '2026-10-24T17:30:00Z', early: true, by: 'Fernando' }, ended: true,
      ended_by: 'declaration', can_declare: false, can_withdraw: true })))
    vi.mocked(withdrawWeekEnd).mockResolvedValue({ review_revision: 9 })
    renderAt('/privado/fecho')
    const notice = await screen.findByTestId('week-end-notice')
    expect(notice.textContent).toMatch(/^Semana terminada · sábado, 24 out às 18:30Por Fernando, antes da hora habitual\./)
    expect(screen.getByText('Pronto para aprovar')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Terminar a semana' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Aprovar valores a pagar' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a semana' }))
    expect(within(sheet()).getByText(/O período volta a aceitar registos/)).toBeTruthy()
    await confirmAs()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Continuar a semana' }))
    await waitFor(() => expect(withdrawWeekEnd).toHaveBeenCalledTimes(1))
    expect(vi.mocked(withdrawWeekEnd).mock.calls[0]![2]).toEqual({ periodId: 'p10' })
  })
  it('a server refusal is said plainly', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-24T19:30:00Z'))
    vi.mocked(getFecho).mockResolvedValue(weekFecho(week()))
    vi.mocked(declareWeekEnd).mockRejectedValue(new AppError('domain', 'WEEK_END_TOO_EARLY', 'WEEK_END_TOO_EARLY'))
    renderAt('/privado/fecho')
    fireEvent.click(await screen.findByRole('button', { name: 'Terminar a semana' }))
    await confirmAs()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Terminar a semana' }))
    expect(await within(sheet()).findByText('A semana só pode ser terminada no último dia de funcionamento.')).toBeTruthy()
  })
  it('without a schedule nothing changes: no week notice, approval as before', async () => {
    vi.mocked(getFecho).mockResolvedValue(fecho({ week_end: { ...week(), available: false, can_declare: false } }, [nadia, laurindo]))
    renderAt('/privado/fecho')
    expect(await screen.findByText('Pronto para aprovar')).toBeTruthy()
    expect(screen.queryByTestId('week-end-notice')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Terminar a semana' })).toBeNull()
  })
  it('the history names the week end and its withdrawal', async () => {
    vi.mocked(getFecho).mockResolvedValue(weekFecho(week()))
    vi.mocked(getFechoHistory).mockResolvedValue([
      { kind: 'week_end', at: '2026-10-24T19:05:00Z', early: false, by: 'Merce' },
      { kind: 'week_end_withdrawn', at: '2026-10-24T18:40:00Z', by: 'Fernando' },
      { kind: 'week_end', at: '2026-10-24T17:30:00Z', early: true, by: 'Fernando' },
    ])
    renderAt('/privado/fecho/historico')
    expect(await screen.findAllByText('Semana terminada')).toHaveLength(2)
    expect(screen.getByText('Semana continuada')).toBeTruthy()
    expect(screen.getByText('antes da hora habitual · por Fernando')).toBeTruthy()
    expect(screen.getByText('por Merce')).toBeTruthy()
  })
})
