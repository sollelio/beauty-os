import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import type { BusinessCosts, BusinessFinance, BusinessHealth, BusinessServices, FinanceMetric, BusinessTeam, Change, MetricKey, PeriodMetrics, ServiceRow } from '../../modules/business/api'

const rpc = vi.fn()
vi.mock('../../shared/supabase/client', () => ({ getSupabase: () => ({ rpc }) }))
import { PrivateGate, PrivateHome } from '../../app/PrivateGate'
import { OverviewPage } from './OverviewPage'
import { TeamPage } from './TeamPage'
import { ServicesPage } from './ServicesPage'
import { CostsPage } from './CostsPage'
import { FinancePage } from './FinancePage'

const org = { id: 'o', name: 'Org', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const K = (kz: number) => kz * 100
const KEYS: MetricKey[] = ['production_minor', 'operating_costs_minor', 'operating_result_minor', 'free_minor', 'team_earnings_minor', 'expenses_minor', 'purchases_salon_minor', 'services_count']
const ch = (o: Partial<Record<MetricKey, Change>>) => Object.fromEntries(KEYS.map((k) => [k, o[k] ?? { delta_minor: 0, percent: 0 }])) as Record<MetricKey, Change>
const period = (id: string, label: string, state: PeriodMetrics['period']['state'] = 'fechado') => ({ id, label, state, starts_on: '2025-02-03', ends_on: '2025-02-09', days: 7, is_complete: true })
const cur: PeriodMetrics = { period: period('e5', 'Semana 5'), source: 'close_statement', production_minor: K(120000), services_count: 12,
  team_earnings_minor: K(48000), expenses_minor: K(23500), purchases_salon_minor: K(10000), operating_costs_minor: K(81500), operating_result_minor: K(38500),
  retention_pct: 32.1, free_minor: K(38500), unpaid_team_minor: 0, approved: true, pending_rules_count: 0, private_fields: [] }
const prev: PeriodMetrics = { ...cur, period: period('e4', 'Semana 4'), production_minor: K(100000), operating_result_minor: K(52000), expenses_minor: K(8000), purchases_salon_minor: 0, team_earnings_minor: K(40000) }
const base: BusinessHealth = {
  current: cur, previous: prev,
  average_3: { ...Object.fromEntries(KEYS.map((k) => [k, 0])) as Record<MetricKey, number>, production_minor: 9333333, operating_result_minor: 4966667,
               periods: [period('e4', 'Semana 4'), period('e3', 'Semana 3'), period('e2', 'Semana 2')], private_fields: [] },
  changes: {
    previous: ch({ production_minor: { delta_minor: K(20000), percent: 20 }, operating_result_minor: { delta_minor: -K(13500), percent: -26 },
                   expenses_minor: { delta_minor: K(15500), percent: 193.8 }, purchases_salon_minor: { delta_minor: K(10000), percent: null },
                   team_earnings_minor: { delta_minor: K(8000), percent: 20 } }),
    average_3: ch({ production_minor: { delta_minor: 2666667, percent: 28.6 }, operating_result_minor: { delta_minor: -1116667, percent: -22.5 } }),
  },
  expense_categories: [{ category_id: 'x', label: 'Luz', current_minor: K(20000), previous_minor: K(6000), average_3_minor: 533333, reference_presence: 3 }],
  meta: { period_state: 'fechado', is_complete: true, history_count: 4, baseline: 'previous_and_average_3', calculation_version: 'v',
          comparison: { previous: { available: true, reason: null, period: { id: 'e4', label: 'Semana 4', state: 'fechado' } }, average_3: { available: true, reason: null, window: 3 } } },
  open_periods: [{ id: 'e6', label: 'Semana 6', state: 'pronto_para_pagamento', is_complete: true, unpaid_team_minor: K(30000), unpaid_private: false, pending_rules_count: 0 }],
  trend: [{ id: 'e4', label: 'Semana 4', is_complete: true, production_minor: K(100000), operating_result_minor: K(52000), result_private: false },
          { id: 'e5', label: 'Semana 5', is_complete: true, production_minor: K(120000), operating_result_minor: K(38500), result_private: false }],
}
const member = (n: number, prod: number, svc: number, share: number, prev: number | null, change: Change | null) =>
  ({ person_id: `p${n}`, display_name: `Profissional ${n}`, services_count: svc, production_minor: K(prod), average_ticket_minor: Math.round(K(prod) / svc),
     share_pct: share, previous_production_minor: prev === null ? null : K(prev), change })
const team: BusinessTeam = {
  period: { id: 'e5', label: 'Semana 5', state: 'fechado', starts_on: '2025-02-03', ends_on: '2025-02-09', is_complete: true },
  summary: { production_minor: K(200000), services_count: 21, average_ticket_minor: 952381, active_count: 4, top_share_pct: 35, top_two_share_pct: 68 },
  comparison: { available: true, reason: null, period: { id: 'e4', label: 'Semana 4', state: 'fechado' } },
  people: [member(1, 70000, 7, 35, 100000, { delta_minor: -K(30000), percent: -30 }), member(2, 66000, 6, 33, 50000, { delta_minor: K(16000), percent: 32 }),
           member(3, 32000, 4, 16, 50000, { delta_minor: -K(18000), percent: -36 }), member(4, 32000, 4, 16, 0, { delta_minor: K(32000), percent: null })],
}
const even: BusinessTeam = { ...team, summary: { ...team.summary, top_share_pct: 25, top_two_share_pct: 50 },
  people: team.people!.map((x) => ({ ...x, production_minor: K(50000), share_pct: 25 })) }   // no concentration
const aggregate: BusinessTeam = { ...team, people: null }   // what a business-only viewer receives
const row = (id: string, name: string, count: number, revKz: number, share: number, prev: [number, number] | null, before: [number, number] | null): ServiceRow => ({
  service_id: id, name, count, revenue_minor: K(revKz), average_ticket_minor: Math.round(K(revKz) / count), share_pct: share,
  previous: prev && { count: prev[0], revenue_minor: K(prev[1]) }, before_previous: before && { count: before[0], revenue_minor: K(before[1]) },
  change: prev && { count: { delta_minor: count - prev[0], percent: prev[0] ? Math.round(((count - prev[0]) * 1000) / prev[0]) / 10 : null },
                    revenue: { delta_minor: K(revKz - prev[1]), percent: prev[1] ? Math.round(((revKz - prev[1]) * 1000) / prev[1]) / 10 : null } } })
const sv: BusinessServices = {
  period: { id: 'e5', label: 'Semana 5', state: 'fechado', starts_on: '2025-02-03', ends_on: '2025-02-09', is_complete: true },
  summary: { production_minor: K(391000), services_count: 59, average_ticket_minor: 662712, distinct_services: 6, top_share_pct: 38, top_two_share_pct: 59 },
  comparison: { previous: { available: true, reason: null, period: { id: 'e4', label: 'Semana 4', state: 'fechado' } },
                before_previous: { available: true, reason: null, period: { id: 'e3', label: 'Semana 3', state: 'fechado' } } },
  services: [row('s1', 'Corte', 30, 150000, 38.4, [20, 100000], [20, 100000]), row('s2', 'Cor', 4, 80000, 20.5, [5, 100000], [4, 80000]),
             row('s5', 'Alongamento', 6, 60000, 15.3, [8, 80000], [10, 100000]), row('s4', 'Pedicure', 9, 45000, 11.5, [7, 35000], [5, 25000])],
  other: { services: 2, count: 10, revenue_minor: K(56000) },
}
const quietSv: BusinessServices = { ...sv, summary: { ...sv.summary, top_share_pct: 20, top_two_share_pct: 40 },
  services: sv.services.map((x) => ({ ...x, before_previous: null })), comparison: { ...sv.comparison, before_previous: { available: false, reason: 'no_previous_period', period: null } } }
const okCmp = { available: true, reason: null, period: { id: 'e4', label: 'Semana 4', state: 'fechado' as const } }
const cs: BusinessCosts = {
  period: { id: 'e5', label: 'Semana 5', state: 'fechado', starts_on: '2025-02-03', ends_on: '2025-02-09', is_complete: true },
  comparison: { previous: okCmp, average_3: { available: true, reason: null, window: 3 } },
  summary: { production_minor: K(200000), expenses_minor: K(55000), purchases_salon_minor: K(23000), expenses_pct_of_production: 27.5,
             purchases_pct_of_production: 11.5, purchases_private: false, products_attention: 2 },
  expenses: [
    { category_id: 'c2', label: 'Renda', current_minor: K(30000), share_of_expenses_pct: 54.5, share_of_production_pct: 15, previous_minor: K(30000),
      average_3_minor: K(30000), reference_presence: 3, change_previous: { delta_minor: 0, percent: 0 }, change_average_3: { delta_minor: 0, percent: 0 } },
    { category_id: 'c1', label: 'Materiais', current_minor: K(18000), share_of_expenses_pct: 32.7, share_of_production_pct: 9, previous_minor: K(11000),
      average_3_minor: K(11000), reference_presence: 3, change_previous: { delta_minor: K(7000), percent: 63.6 }, change_average_3: { delta_minor: K(7000), percent: 63.6 } }],
  purchases: { salon_minor: K(23000), private: false, previous_private: false, previous_salon_minor: K(10000), change: { delta_minor: K(13000), percent: 130 },
               products: [{ product_id: 'p1', name: 'Acetona', unit_word: 'unid.', purchases_count: 3, quantity: 3, salon_minor: K(18000), last_purchased_at: '2025-02-07T11:00:00+00:00' },
                          { product_id: 'p3', name: 'Luvas', unit_word: 'unid.', purchases_count: 1, quantity: 2, salon_minor: K(5000), last_purchased_at: '2025-02-08T11:00:00+00:00' }] },
  stock: { baixo: 1, comprar: 1, on_list: 1, urgent: 1,
           attention: [{ product_id: 'p1', name: 'Acetona', state: 'comprar', on_list: true, urgent: true }, { product_id: 'p2', name: 'Algodão', state: 'baixo', on_list: false, urgent: false }],
           window: { days: 30, from: '2025-01-11', to: '2025-02-09' },
           activity: [{ product_id: 'p1', name: 'Acetona', purchases: 4, marks: 3, last_purchased_at: null }, { product_id: 'p3', name: 'Luvas', purchases: 1, marks: 1, last_purchased_at: null }] },
}
const quietCs: BusinessCosts = { ...cs, purchases: { ...cs.purchases, change: { delta_minor: 0, percent: 0 } }, stock: { ...cs.stock, activity: [] } }
const fm = (key: FinanceMetric['key'], current: number | null, previous: number | null, change: Change | null, o: Partial<FinanceMetric> = {}): FinanceMetric =>
  ({ key, current, hidden: false, previous, previous_hidden: false, average_3: null, average_3_hidden: false, change_previous: change, change_average_3: null, ...o })
const fin: BusinessFinance = {
  period: period('e5', 'Semana 5'), source: 'close_statement', comparison: base.meta.comparison, private_fields: [], pending_rules_count: 0,
  metrics: [fm('production_minor', K(220000), K(200000), { delta_minor: K(20000), percent: 10 }, { average_3: 20333333, change_average_3: { delta_minor: 1666667, percent: 8.2 } }),
            fm('team_earnings_minor', K(88000), K(80000), { delta_minor: K(8000), percent: 10 }), fm('expenses_minor', K(48000), K(41000), { delta_minor: K(7000), percent: 17.1 }),
            fm('purchases_salon_minor', K(23000), K(10000), { delta_minor: K(13000), percent: 130 }), fm('operating_costs_minor', K(159000), K(131000), { delta_minor: K(28000), percent: 21.4 }),
            fm('operating_result_minor', K(61000), K(69000), { delta_minor: -K(8000), percent: -11.6 }), fm('free_minor', K(51000), K(74000), { delta_minor: -K(23000), percent: -31.1 })],
  indicators: { operating_cost_ratio_pct: 72.3, retention_pct: 27.7, retention_previous_pct: 34.5, retention_average_3_pct: 34.8, retention_change_previous_pp: -6.8, retention_change_average_3_pp: -7.1 },
  result_change: { delta_minor: -K(8000), percent: -11.6 },
  drivers: [{ kind: 'purchases_salon', label: null, current_minor: K(23000), previous_minor: K(10000), delta_minor: K(13000), percent: 130 },
            { kind: 'team_earnings', label: null, current_minor: K(88000), previous_minor: K(80000), delta_minor: K(8000), percent: 10 },
            { kind: 'expense_category', label: 'Materiais', current_minor: K(18000), previous_minor: K(11000), delta_minor: K(7000), percent: 63.6 }],
  trend: [{ id: 'e4', label: 'Semana 4', state: 'fechado', is_complete: true, production_minor: K(200000), operating_result_minor: K(69000), retention_pct: 34.5, private_fields: [] },
          { id: 'e5', label: 'Semana 5', state: 'fechado', is_complete: true, production_minor: K(220000), operating_result_minor: K(61000), retention_pct: 27.7, private_fields: [] }],
  reserve: { balance_minor: K(35000), allocated_minor: K(10000), used_minor: 0, previous_allocated_minor: 0, previous_used_minor: K(5000) },
  obligations: { state: 'fechado', approved: true, paid_team_minor: K(88000), unpaid_team_minor: 0, free_minor: K(51000), undistributed_minor: K(21000), owners_decision: 'amount' },
  open_periods: [],
}
const status = (o: Record<string, unknown> = {}) => ({ active: true, person_id: 'f', display_name: 'Fernando', view: 'manager', business_health: true,
  expires_at: new Date(Date.now() + 300_000).toISOString(), ...o })

function serve(health: BusinessHealth | { error: string }, st: Record<string, unknown> = status(), tm: BusinessTeam | { error: string } = even, svs: BusinessServices = quietSv, cst: BusinessCosts = quietCs,
               fi: BusinessFinance | { error: string } = fin) {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === 'private_context_status') return { data: st, error: null }
    if (fn === 'end_private_context') return { data: { ok: true }, error: null }
    if (fn === 'business_health') return 'error' in health ? { data: null, error: { message: health.error, code: 'P0001' } } : { data: health, error: null }
    if (fn === 'business_team') return 'error' in tm ? { data: null, error: { message: tm.error, code: 'P0001' } } : { data: tm, error: null }
    if (fn === 'business_services') return { data: svs, error: null }
    if (fn === 'business_costs') return { data: cst, error: null }
    if (fn === 'business_finance') return 'error' in fi ? { data: null, error: { message: fi.error, code: 'P0001' } } : { data: fi, error: null }
    if (fn === 'business_periods') return { data: [period('e5', 'Semana 5'), period('e4', 'Semana 4')], error: null }
    return { data: [], error: null }
  })
}
function renderAt(path = '/privado/negocio') {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OrganizationContext.Provider value={org}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/privado" element={<PrivateGate />}>
              <Route index element={<PrivateHome />} />
              <Route path="negocio" element={<OverviewPage />} />
              <Route path="negocio/equipa" element={<TeamPage />} />
              <Route path="negocio/servicos" element={<ServicesPage />} />
              <Route path="negocio/custos" element={<CostsPage />} />
              <Route path="negocio/financas" element={<FinancePage />} />
              <Route path="fecho" element={<p>Fecho</p>} />
              <Route path="equipa" element={<p>Equipa</p>} />
              <Route path="situacao/:personId" element={<p>Situação</p>} />
            </Route>
            <Route path="/privado/entrar" element={<p>Entrada privada</p>} />
            <Route path="/" element={<p>Hoje</p>} />
          </Routes>
        </MemoryRouter>
      </OrganizationContext.Provider>
    </QueryClientProvider>,
  )
}
beforeEach(() => rpc.mockReset())

describe('Negócio · Visão geral', () => {
  it('needs an active private context', async () => {
    serve(base, { active: false })
    renderAt()
    expect(await screen.findByText('Entrada privada')).toBeTruthy()
    expect(rpc.mock.calls.some(([fn]) => fn === 'business_health')).toBe(false)
  })

  it('shows the read-model figures, retention, comparison and drivers', async () => {
    serve(base)
    renderAt()
    const o = await screen.findByTestId('overview')
    expect(within(o).getAllByRole('definition').map((d) => d.textContent)).toEqual(
      ['120.000 Kz · 12 serviços', '38.500 Kz · custos 81.500 Kz', '38.500 Kz', '0 Kz'])
    expect(screen.getByTestId('retention').textContent).toContain('32,1%')
    const c = screen.getByTestId('changes').textContent!
    expect(c).toContain('Face a Semana 4: produção +20% (+20.000 Kz) · resultado −26% (−13.500 Kz).')
    expect(c).toContain('Face à média dos últimos 3 períodos fechados: produção +28,6%')
    expect(c).toContain('Despesas +15.500 Kz · sobretudo Luz +14.000 Kz')
    expect(screen.getByText('Valores do fecho deste período.')).toBeTruthy()
  })

  it('insufficient history and an incomplete period say so instead of comparing', async () => {
    serve({ ...base, previous: null, average_3: null, changes: { previous: null, average_3: null }, open_periods: [],
      current: { ...cur, period: { ...cur.period, is_complete: false, state: 'aberto' }, source: 'live', unpaid_team_minor: null },
      meta: { ...base.meta, is_complete: false, baseline: 'none', comparison: { previous: { available: false, reason: 'current_incomplete', period: null },
        average_3: { available: false, reason: 'current_incomplete', window: 3 } } } })
    renderAt()
    expect((await screen.findByTestId('changes')).textContent).toBe('O que mudou?O período ainda está a decorrer: a comparação fica disponível quando terminar.')
    expect(screen.getByText('Ainda não aprovado')).toBeTruthy()
    expect(screen.getByText('Nada a assinalar neste período.')).toBeTruthy()
  })

  it('B11: a figure that would resolve to one person is "Não mostrado", with the reason; nothing compared or built from it', async () => {
    const H = ['team_earnings_minor', 'operating_costs_minor', 'operating_result_minor', 'retention_pct', 'free_minor', 'unpaid_team_minor'] as const
    const none = { delta_minor: null, percent: null }
    serve({ ...base,
      current: { ...cur, team_earnings_minor: null, operating_costs_minor: null, operating_result_minor: null, retention_pct: null, free_minor: null,
                 unpaid_team_minor: null, private_fields: [...H] },
      previous: { ...prev, team_earnings_minor: null, operating_costs_minor: null, operating_result_minor: null, retention_pct: null, free_minor: null, private_fields: [...H.slice(0, 5)] },
      average_3: { ...base.average_3!, operating_result_minor: null, team_earnings_minor: null, operating_costs_minor: null, free_minor: null,
                   private_fields: ['team_earnings_minor', 'operating_costs_minor', 'operating_result_minor', 'free_minor'] },
      changes: { previous: { ...base.changes.previous!, team_earnings_minor: none, operating_costs_minor: none, operating_result_minor: none, free_minor: none },
                 average_3: { ...base.changes.average_3!, team_earnings_minor: none, operating_costs_minor: none, operating_result_minor: none, free_minor: none } },
      open_periods: [{ ...base.open_periods[0]!, unpaid_team_minor: null, unpaid_private: true }],
      trend: base.trend.map((t) => ({ ...t, operating_result_minor: null, result_private: true })) }, status({ view: 'self' }), aggregate)
    renderAt()
    const o = await screen.findByTestId('overview')
    expect(within(o).getAllByRole('definition').map((d) => d.textContent).slice(1)).toEqual(['Não mostrado', 'Não mostrado', 'Não mostrado'])
    expect(within(o).getAllByRole('definition')[0]!.textContent).toContain('120.000')               // production stays
    expect(screen.getByTestId('team-private').textContent).toContain('permitiria calcular')
    expect(screen.getByTestId('retention').textContent).toContain('Não mostrado')
    const c = screen.getByTestId('changes').textContent!
    expect(c).toContain('produção +20%')
    expect(c).toContain('resultado não mostrado')
    expect(c).not.toContain('Ganhos da equipa')
    expect(screen.getByTestId('trend').textContent).toContain('resultado não mostrado')
    expect(screen.queryAllByTestId('insight').map((i) => i.dataset.kind)).toEqual(['expense_category_high', 'team_concentration'])
  })

  it('pending rule: "—" for result, Livre and retention', async () => {
    serve({ ...base, current: { ...cur, pending_rules_count: 1, operating_costs_minor: null, operating_result_minor: null, free_minor: null, retention_pct: null } })
    renderAt()
    const o = await screen.findByTestId('overview')
    expect(within(o).getAllByRole('definition').map((d) => d.textContent).slice(1, 3)).toEqual(['—', '—'])
    expect(screen.getByText(/1 regra de remuneração por definir/)).toBeTruthy()
  })

  it('insights: action first, at most 5, each explainable', async () => {
    serve(base)
    renderAt()
    const cards = await screen.findAllByTestId('insight')
    expect(cards.map((c) => c.dataset.kind)).toEqual(['payments_pending', 'production_up_result_down', 'expense_category_high'])
    fireEvent.click(within(cards[1]!).getByRole('button'))
    const d = within(cards[1]!).getByTestId('insight-detail').textContent!
    expect(d).toContain('Semana 5 comparado com Semana 4 (fechado).')
    expect(d).toContain('não indica que tenham sido a causa')
    fireEvent.click(within(cards[0]!).getByRole('button'))
    expect(within(cards[0]!).getByRole('button', { name: 'Ver pagamentos' })).toBeTruthy()          // a team-finance holder
  })

  it('business access without team finance: overview yes, no finance links', async () => {
    serve(base, status({ view: 'self', display_name: 'Duart' }))
    renderAt()
    const cards = await screen.findAllByTestId('insight')
    fireEvent.click(within(cards[0]!).getByRole('button'))
    expect(within(cards[0]!).queryByRole('button', { name: 'Ver pagamentos' })).toBeNull()
    expect(screen.queryByText('Fecho do período')).toBeNull()
  })

  it('the private home opens Negócio for a business-only holder', async () => {
    serve(base, status({ view: 'self' }))
    renderAt('/privado')
    expect(await screen.findByTestId('overview')).toBeTruthy()
  })

  it('without business.health.read the database refuses and nothing is shown', async () => {
    serve({ error: 'NOT_AUTHORIZED' }, status({ view: 'self', business_health: false }))
    renderAt()
    expect(await screen.findByText('Esta área é só para quem acompanha o negócio.')).toBeTruthy()
    expect(screen.queryByTestId('overview')).toBeNull()
  })

  it('a context that ended on the server drops the data and returns to the entry', async () => {
    serve({ error: 'VERIFICATION_REQUIRED' })
    renderAt()
    expect(await screen.findByText('Entrada privada')).toBeTruthy()
  })
})

describe('Negócio → Equipa', () => {
  beforeEach(() => rpc.mockReset())

  it('needs the private area; the overview leads to it and shows the concentration insight', async () => {
    serve(base, { active: false })
    renderAt('/privado/negocio/equipa')
    expect(await screen.findByText('Entrada privada')).toBeTruthy()
    serve(base, status(), team)
    renderAt()
    expect((await screen.findAllByTestId('insight')).map((i) => i.dataset.kind)).toContain('team_concentration')
    fireEvent.click(screen.getByRole('button', { name: /Equipa/ }))
    expect(await screen.findByTestId('team-summary')).toBeTruthy()
  })

  it('business-only viewer: the team as a whole and the unnamed concentration; no names, no per-person figures, no finance action', async () => {
    serve(base, status({ view: 'self' }), aggregate)
    renderAt('/privado/negocio/equipa')
    const sum = (await screen.findByTestId('team-summary')).textContent!
    for (const x of ['200.000', '21', '9.523,81', 'Profissionais com serviços4', 'Maior contributo 35% · dois maiores 68%']) expect(sum).toContain(x)
    expect(screen.getByTestId('insight').textContent).toContain('68% da produção está concentrada em dois profissionais.')
    expect(screen.getByTestId('team-aggregate-only').textContent).toContain('só para quem acompanha as finanças da equipa')
    expect(screen.queryAllByTestId('member')).toEqual([])
    expect(document.body.textContent).not.toMatch(/Profissional \d|66\.000|33%/)
    expect(screen.queryByRole('button', { name: 'Ver situação completa' })).toBeNull()
  })

  it('finance reader: summary, professionals with their change, neutral concentration; no ranking treatment', async () => {
    serve(base, status(), team)
    renderAt('/privado/negocio/equipa')
    const sum = (await screen.findByTestId('team-summary')).textContent!
    for (const x of ['200.000', '21', '9.523,81', 'Profissionais com serviços4', 'Maior contributo 35% · dois maiores 68%']) expect(sum).toContain(x)
    const cards = screen.getAllByTestId('member')
    expect(cards.map((c) => within(c).getByRole('strong').textContent)).toEqual(['Profissional 1', 'Profissional 2', 'Profissional 3', 'Profissional 4'])
    expect(cards[1]!.textContent).toContain('11.000')                                     // average ticket
    expect(cards[1]!.textContent).toContain('33%')
    expect(screen.getAllByTestId('member-change').map((c) => c.textContent)).toEqual(
      ['Face a Semana 4: −30% (−30.000 Kz)', 'Face a Semana 4: +32% (+16.000 Kz)', 'Face a Semana 4: −36% (−18.000 Kz)', 'Sem produção em Semana 4'])
    expect(screen.getByTestId('insight').textContent).toContain('68% da produção está concentrada em dois profissionais.')
    const page = document.body.textContent!.replaceAll('Ver situação completa', '')
    expect(page).not.toMatch(/\b[1-4]\.?º|melhor|pior|ranking|lugar|Ganho|Adiantamento|Pagamento|Falta pagar/i)
  })

  it('comparison unavailable: the reason, no change line', async () => {
    serve(base, status(), { ...team, comparison: { available: false, reason: 'previous_not_closed', period: { id: 'e4', label: 'Semana 4', state: 'aberto' } },
      people: team.people!.map((x) => ({ ...x, change: null, previous_production_minor: null })) })
    renderAt('/privado/negocio/equipa')
    expect((await screen.findByTestId('team-comparison-unavailable')).textContent).toBe('O período anterior ainda não está fechado: os valores dele podem mudar.')
    expect(screen.queryAllByTestId('member-change')).toEqual([])
  })

  it('a team-finance reader gets "Ver situação completa" into the existing situation view', async () => {
    serve(base, status(), team)
    renderAt('/privado/negocio/equipa')
    const buttons = await screen.findAllByRole('button', { name: 'Ver situação completa' })
    expect(buttons).toHaveLength(4)
    fireEvent.click(buttons[0]!)
    expect(await screen.findByText('Situação')).toBeTruthy()
  })

  it('no insight with fewer than three professionals', async () => {
    serve(base, status({ view: 'self' }), { ...aggregate, summary: { ...team.summary, active_count: 2, top_share_pct: 51, top_two_share_pct: 100 } })
    renderAt('/privado/negocio/equipa')
    await screen.findByTestId('team-summary')
    expect(screen.queryByTestId('insight')).toBeNull()
  })
})

describe('Negócio → Serviços', () => {
  beforeEach(() => rpc.mockReset())

  it('needs the private area; the overview leads to it and carries its insights', async () => {
    serve(base, { active: false }, even, sv)
    renderAt('/privado/negocio/servicos')
    expect(await screen.findByText('Entrada privada')).toBeTruthy()
    serve(base, status({ view: 'self' }), even, sv)
    renderAt()
    expect((await screen.findAllByTestId('insight')).map((i) => i.dataset.kind)).toContain('service_decline')
    fireEvent.click(screen.getByRole('button', { name: /Serviços/ }))
    expect(await screen.findByTestId('services-summary')).toBeTruthy()
  })

  it('summary, top lists, service cards with comparison, the grouped services; no person, no ranking', async () => {
    serve(base, status({ view: 'self' }), even, sv)
    renderAt('/privado/negocio/servicos')
    const sum = (await screen.findByTestId('services-summary')).textContent!
    for (const x of ['391.000', 'Serviços realizados59', '6.627,12', 'Serviços diferentes6']) expect(sum).toContain(x)
    expect(screen.getByTestId('top-revenue').textContent).toBe('Mais receitaCorte · 150.000 KzCor · 80.000 KzAlongamento · 60.000 Kz')
    expect(screen.getByTestId('top-count').textContent).toBe('Mais realizadosCorte · 30Pedicure · 9Alongamento · 6')
    const cards = screen.getAllByTestId('service')
    expect(cards.map((c) => within(c).getByRole('strong').textContent)).toEqual(['Corte', 'Cor', 'Alongamento', 'Pedicure'])
    expect(cards[0]!.textContent).toContain('38,4%')
    expect(cards[1]!.textContent).toContain('20.000')                                     // average actual ticket
    expect(screen.getAllByTestId('service-change')[0]!.textContent).toBe('Face a Semana 4: +50% em quantidade · +50% em receita')
    expect(screen.getByTestId('services-other').textContent).toContain('Outros serviços (2)')
    expect(document.body.textContent).not.toMatch(/Profissional|melhor|pior|ranking|campanha|redes sociais/i)
  })

  it('concentration, growth and decline insights, each explainable', async () => {
    serve(base, status({ view: 'self' }), even, sv)
    renderAt('/privado/negocio/servicos')
    const cards = await screen.findAllByTestId('insight')
    expect(cards.map((c) => c.dataset.kind)).toEqual(['service_decline', 'service_concentration', 'service_growth'])
    expect(cards.map((c) => within(c).getByRole('strong').textContent)).toEqual(['Alongamento caiu pelo segundo período consecutivo.',
      'Um serviço representa 38% da produção.', 'Pedicure cresce pelo segundo período consecutivo.'])
    fireEvent.click(within(cards[0]!).getByRole('button'))
    const d = within(cards[0]!).getByTestId('insight-detail').textContent!
    expect(d).toContain('Alongamento: 10 → 8 → 6')
    expect(d).toContain('Vale investigar procura, disponibilidade, preço ou promoção')
  })

  it('insufficient history says so: no trend insight, and no comparison without a previous period', async () => {
    serve(base, status({ view: 'self' }), even, quietSv)
    renderAt('/privado/negocio/servicos')
    expect((await screen.findByTestId('services-trend-unavailable')).textContent).toContain('três períodos comparáveis')
    expect(screen.queryAllByTestId('insight')).toEqual([])
    rpc.mockReset()
    serve(base, status({ view: 'self' }), even, { ...quietSv, comparison: { previous: { available: false, reason: 'no_previous_period', period: null },
      before_previous: { available: false, reason: 'no_previous_period', period: null } }, services: quietSv.services.map((x) => ({ ...x, previous: null, change: null })) })
    renderAt('/privado/negocio/servicos?p=x')
    expect((await screen.findAllByTestId('services-comparison-unavailable'))[0]!.textContent).toBe('Ainda não há um período anterior para comparar.')
  })
})

describe('Negócio → Custos & Stock', () => {
  beforeEach(() => rpc.mockReset())
  const cur5 = { ...cur, expenses_minor: K(55000), production_minor: K(200000) }
  const withMaterials = { ...base, current: cur5,
    expense_categories: [{ category_id: 'c1', label: 'Materiais', current_minor: K(18000), previous_minor: K(11000), average_3_minor: K(11000), reference_presence: 3 }] }

  it('needs the private area; the overview leads to it', async () => {
    serve(base, { active: false })
    renderAt('/privado/negocio/custos')
    expect(await screen.findByText('Entrada privada')).toBeTruthy()
    serve(base, status({ view: 'self' }))
    renderAt()
    fireEvent.click(await screen.findByRole('button', { name: /Custos & Stock/ }))
    expect(await screen.findByTestId('costs-summary')).toBeTruthy()
  })

  it('summary, categories with comparison, salon-funded purchases, stock as marked; no person or contribution', async () => {
    serve(withMaterials, status({ view: 'self' }), even, quietSv, cs)
    renderAt('/privado/negocio/custos')
    const sum = (await screen.findByTestId('costs-summary')).textContent!
    for (const x of ['55.000', '27,5% da produção', '23.000', '11,5% da produção', 'Produtos a precisar de atenção2']) expect(sum).toContain(x)
    const cats = screen.getAllByTestId('category')
    expect(cats.map((c) => within(c).getByRole('strong').textContent)).toEqual(['Renda', 'Materiais'])
    expect(cats[1]!.textContent).toContain('32,7%')
    expect(screen.getAllByTestId('category-change')[1]!.textContent).toBe('Face a Semana 4: +63,6% · face à média de 3: +63,6%')
    const pur = screen.getByTestId('purchases').textContent!
    expect(pur).toContain('23.000 Kz suportados pelo salão · +130% face a Semana 4')
    expect(pur).toContain('Acetona18.000 Kz · 3 compras')
    expect(pur).toContain('Só conta a parte paga pelo salão.')
    const st = screen.getByTestId('stock').textContent!
    expect(st).toContain('Agora: 1 comprar · 1 baixo · 1 urgente · 1 na lista')
    expect(st).toContain('Acetona · Comprar · urgente')
    expect(screen.getByTestId('stock-activity').textContent).toContain('Acetona4 compras · 3 marcações')
    expect(document.body.textContent).not.toMatch(/Profissional|contribui|unidades restantes|consumo de/i)
  })

  it('each insight: expense category high, purchases up, product attention, each explainable', async () => {
    serve(withMaterials, status({ view: 'self' }), even, quietSv, cs)
    renderAt('/privado/negocio/custos')
    const cards = await screen.findAllByTestId('insight')
    expect(cards.map((c) => c.dataset.kind)).toEqual(['expense_category_high', 'purchases_up', 'product_attention'])
    expect(cards.map((c) => within(c).getByRole('strong').textContent)).toEqual(['Materiais: 64% acima da média dos últimos 3 períodos.',
      'As compras suportadas pelo salão aumentaram 130%.', 'Acetona merece atenção: 4 compras e 3 marcações como baixo ou para comprar nos últimos 30 dias.'])
    fireEvent.click(within(cards[2]!).getByRole('button'))
    expect(within(cards[2]!).getByTestId('insight-detail').textContent).toContain('Vale rever a quantidade habitual de compra ou o padrão de utilização')
  })

  it('a salon-funded figure that would give one person\'s contribution is "Não mostrado", with the reason; no purchases-up insight', async () => {
    const hiddenCs: BusinessCosts = { ...cs, summary: { ...cs.summary, purchases_salon_minor: null, purchases_pct_of_production: null, purchases_private: true },
      purchases: { ...cs.purchases, salon_minor: null, private: true, change: { delta_minor: null, percent: null }, products: cs.purchases.products.map((x) => ({ ...x, salon_minor: null })) } }
    serve(base, status({ view: 'self' }), even, quietSv, hiddenCs)
    renderAt('/privado/negocio/custos')
    expect((await screen.findByTestId('costs-summary')).textContent).toContain('Compras (parte do salão)Não mostrado')
    expect(screen.getByTestId('purchases-private').textContent).toContain('quanto uma pessoa contribuiu do seu dinheiro para as compras')
    expect(screen.getByTestId('purchases').textContent).toContain('AcetonaNão mostrado · 3 compras')
    expect(screen.queryAllByTestId('insight').map((i) => i.dataset.kind)).not.toContain('purchases_up')
    rpc.mockReset()
    serve({ ...base, current: { ...cur, purchases_salon_minor: null, operating_costs_minor: null, operating_result_minor: null, retention_pct: null, free_minor: null,
      private_fields: ['purchases_salon_minor', 'operating_costs_minor', 'operating_result_minor', 'retention_pct', 'free_minor'] } }, status({ view: 'self' }))
    renderAt('/privado/negocio?p=x')
    expect((await screen.findByTestId('team-private')).textContent).toBe('Não mostrado: neste período, este valor permitiria calcular quanto uma pessoa contribuiu do seu dinheiro para as compras.')
  })

  it('insufficient history says so, without comparing', async () => {
    serve(base, status({ view: 'self' }), even, quietSv, { ...quietCs, comparison: { previous: okCmp, average_3: { available: false, reason: 'insufficient_history', window: 3 } },
      expenses: quietCs.expenses.map((x) => ({ ...x, average_3_minor: null, change_average_3: null })) })
    renderAt('/privado/negocio/custos')
    expect((await screen.findByTestId('costs-average-unavailable')).textContent).toBe('Ainda não há períodos fechados suficientes para uma média.')
    expect(screen.getAllByTestId('category-change').map((c) => c.textContent).join()).not.toContain('média de 3')
  })
})

describe('Negócio · Finanças', () => {
  beforeEach(() => rpc.mockReset())
  const f4Health: BusinessHealth = { ...base, current: { ...cur, production_minor: K(220000), operating_result_minor: K(61000), expenses_minor: K(48000), purchases_salon_minor: K(23000),
    team_earnings_minor: K(88000), operating_costs_minor: K(159000), services_count: 22 },
    previous: { ...prev, production_minor: K(200000), operating_result_minor: K(69000), purchases_salon_minor: K(10000), expenses_minor: K(41000), team_earnings_minor: K(80000) },
    changes: { previous: ch({ production_minor: { delta_minor: K(20000), percent: 10 }, operating_result_minor: { delta_minor: -K(8000), percent: -11.6 },
                              purchases_salon_minor: { delta_minor: K(13000), percent: 130 }, team_earnings_minor: { delta_minor: K(8000), percent: 10 },
                              expenses_minor: { delta_minor: K(7000), percent: 17.1 } }), average_3: null },
    meta: { ...base.meta, comparison: { ...base.meta.comparison, average_3: { available: false, reason: 'insufficient_history', window: 3 } } },
    expense_categories: [{ category_id: 'c1', label: 'Materiais', current_minor: K(18000), previous_minor: K(11000), average_3_minor: null, reference_presence: null }] }

  it('needs the private area; the overview leads to it', async () => {
    serve(base, { active: false })
    renderAt('/privado/negocio/financas')
    expect(await screen.findByText('Entrada privada')).toBeTruthy()
    expect(rpc.mock.calls.some(([fn]) => fn === 'business_finance')).toBe(false)
    serve(base, status({ view: 'self' }))
    renderAt()
    fireEvent.click(await screen.findByRole('button', { name: /Finanças/ }))
    expect(await screen.findByTestId('finance-summary')).toBeTruthy()
  })

  it('not a business.health.read holder: the area says so', async () => {
    serve(base, status(), even, quietSv, quietCs, { error: 'NOT_AUTHORIZED' })
    renderAt('/privado/negocio/financas')
    expect((await screen.findByRole('alert')).textContent).toBe('Esta área é só para quem acompanha o negócio.')
  })

  it('summary, decomposition, indicators with the plain-language sentence', async () => {
    serve(f4Health)
    renderAt('/privado/negocio/financas')
    const sum = await screen.findByTestId('finance-summary')
    expect(within(sum).getAllByRole('definition').map((d) => d.textContent)).toEqual(['220.000 Kz', '61.000 Kz', '51.000 Kz', '0 Kz'])
    expect(within(screen.getByTestId('composition')).getAllByRole('definition').map((d) => d.textContent))
      .toEqual(['220.000 Kz', '88.000 Kz', '48.000 Kz', '23.000 Kz', '61.000 Kz'])
    const ind = screen.getByTestId('indicators').textContent!
    expect(ind).toContain('Custos operacionais: 72,3% da produção.')
    expect(ind).toContain('Retenção operacional: 27,7% · −6,8 p.p. face a Semana 4 · −7,1 p.p. face à média')
    expect(screen.getByTestId('retention-sentence').textContent).toBe('De cada 100 Kz produzidos, 27,7 Kz ficaram como resultado operacional, antes das decisões de reserva e distribuição.')
    expect(document.body.textContent).not.toMatch(/lucro/i)
  })

  it('comparison, drivers (no causal claim) and trend', async () => {
    serve(f4Health)
    renderAt('/privado/negocio/financas')
    const c = (await screen.findByTestId('finance-changes')).textContent!
    expect(screen.getByTestId('result-headline').textContent).toBe('Resultado operacional caiu 11,6% face a Semana 4.')
    expect(within(screen.getByTestId('drivers')).getAllByRole('listitem').map((l) => l.textContent))
      .toEqual(['Compras (parte do salão) +130% (+13.000 Kz)', 'Ganhos da equipa +10% (+8.000 Kz)', 'Materiais +63,6% (+7.000 Kz)'])
    expect(c).toContain('não indicam a causa')
    expect(c).toContain('Produção+10% (+20.000 Kz) · antes 200.000 Kz · média 203.333,33 Kz: +8,2% (+16.666,67 Kz)')
    const t = screen.getAllByTestId('trend-point').map((x) => x.textContent)
    expect(t[1]).toBe('Semana 5produção 220.000 Kz · resultado 61.000 Kz · retenção 27,7%')
  })

  it('reserve and decisions/obligations; Fecho and payments links only for team finance', async () => {
    serve(f4Health)
    renderAt('/privado/negocio/financas')
    expect(within(await screen.findByTestId('reserve')).getAllByRole('definition').map((d) => d.textContent))
      .toEqual(['35.000 Kz', '10.000 Kz · antes 0 Kz', '0 Kz · antes 5.000 Kz'])
    expect(within(screen.getByTestId('obligations')).getAllByRole('definition').map((d) => d.textContent))
      .toEqual(['Fechado', 'Registada', '21.000 Kz', '88.000 Kz', '0 Kz'])
    expect(screen.getByRole('button', { name: /Pagamentos/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Fecho do período/ }))
    expect(await screen.findByText('Fecho')).toBeTruthy()
    rpc.mockReset()
    serve(f4Health, status({ view: 'self' }))
    renderAt('/privado/negocio/financas')
    await screen.findAllByTestId('obligations')
    expect(screen.queryByRole('button', { name: /Fecho do período/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Pagamentos/ })).toBeNull()
  })

  it('finance insights only, in context, each explainable', async () => {
    serve(f4Health, status(), even, quietSv, cs)
    renderAt('/privado/negocio/financas')
    const cards = await screen.findAllByTestId('insight')
    expect(cards.map((x) => x.dataset.kind)).toEqual(['payments_pending', 'production_up_result_down'])   // no product_attention here
    fireEvent.click(within(cards[1]!).getByRole('button'))
    expect(within(cards[1]!).getByTestId('insight-detail').textContent).toContain('Compras (parte do salão)')
  })

  it('B11: hidden figures say so; nothing compared, ratioed, trended or driven from them', async () => {
    const H = ['team_earnings_minor', 'operating_costs_minor', 'operating_result_minor', 'retention_pct', 'free_minor', 'unpaid_team_minor', 'paid_team_minor', 'undistributed_minor'] as const
    const hide = (x: FinanceMetric) => (H as readonly string[]).includes(x.key) ? { ...x, current: null, hidden: true, change_previous: null, change_average_3: null } : x
    const hidden: BusinessFinance = { ...fin, private_fields: [...H], metrics: fin.metrics.map(hide),
      indicators: { ...fin.indicators, operating_cost_ratio_pct: null, retention_pct: null, retention_change_previous_pp: null, retention_change_average_3_pp: null },
      result_change: null, drivers: fin.drivers.filter((d) => d.kind !== 'team_earnings'),
      trend: [fin.trend[0]!, { ...fin.trend[1]!, operating_result_minor: null, retention_pct: null, private_fields: ['operating_result_minor', 'retention_pct'] }],
      obligations: { ...fin.obligations, paid_team_minor: null, unpaid_team_minor: null, free_minor: null, undistributed_minor: null } }
    serve(f4Health, status({ view: 'self' }), even, quietSv, quietCs, hidden)
    renderAt('/privado/negocio/financas')
    expect(within(await screen.findByTestId('finance-summary')).getAllByRole('definition').map((d) => d.textContent))
      .toEqual(['220.000 Kz', 'Não mostrado', 'Não mostrado', 'Não mostrado'])
    expect(screen.getByTestId('finance-private').textContent).toBe('Não mostrado: neste período, este valor permitiria calcular quanto uma pessoa da equipa ganha, recebeu ou tem a receber.')
    expect(screen.getByTestId('indicators').textContent).toBe('Retenção e peso dos custos: não mostrado.')
    expect(screen.queryByTestId('retention-sentence')).toBeNull()
    expect(screen.queryByTestId('result-headline')).toBeNull()
    expect(screen.getByTestId('drivers').textContent).not.toContain('Ganhos da equipa')
    expect(screen.getAllByTestId('trend-point')[1]!.textContent).toBe('Semana 5produção 220.000 Kz · resultado não mostrado · retenção não mostrado')
    expect(within(screen.getByTestId('obligations')).getAllByRole('definition').map((d) => d.textContent))
      .toEqual(['Fechado', 'Registada', 'Não mostrado', 'Não mostrado', 'Não mostrado'])
    for (const v of ['88.000', '61.000', '51.000', '21.000', '159.000']) expect(document.body.textContent, v).not.toContain(v)
  })

  it('zero production and an unavailable comparison say so', async () => {
    const zero: BusinessFinance = { ...fin, metrics: fin.metrics.map((x) => ({ ...x, current: 0, previous: null, change_previous: null, average_3: null, change_average_3: null })),
      indicators: { ...fin.indicators, operating_cost_ratio_pct: null, retention_pct: null, retention_change_previous_pp: null, retention_change_average_3_pp: null },
      comparison: { previous: { available: false, reason: 'previous_not_closed', period: null }, average_3: { available: true, reason: null, window: 3 } },
      result_change: null, drivers: [], trend: [] }
    serve(base, status(), even, quietSv, quietCs, zero)
    renderAt('/privado/negocio/financas')
    expect((await screen.findByTestId('indicators')).textContent).toBe('Sem produção neste período: sem rácios.')
    expect(screen.getByTestId('finance-changes').textContent).toBe('O que mudou?O período anterior ainda não está fechado: os valores dele podem mudar.')
  })
})
