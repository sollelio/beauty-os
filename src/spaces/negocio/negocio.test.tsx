import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import type { BusinessHealth, Change, MetricKey, PeriodMetrics } from '../../modules/business/api'

const rpc = vi.fn()
vi.mock('../../shared/supabase/client', () => ({ getSupabase: () => ({ rpc }) }))
import { PrivateGate, PrivateHome } from '../../app/PrivateGate'
import { OverviewPage } from './OverviewPage'

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
  trend: [{ id: 'e4', label: 'Semana 4', is_complete: true, production_minor: K(100000), operating_result_minor: K(52000) },
          { id: 'e5', label: 'Semana 5', is_complete: true, production_minor: K(120000), operating_result_minor: K(38500) }],
}
const status = (o: Record<string, unknown> = {}) => ({ active: true, person_id: 'f', display_name: 'Fernando', view: 'manager', business_health: true,
  expires_at: new Date(Date.now() + 300_000).toISOString(), ...o })

function serve(health: BusinessHealth | { error: string }, st: Record<string, unknown> = status()) {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === 'private_context_status') return { data: st, error: null }
    if (fn === 'end_private_context') return { data: { ok: true }, error: null }
    if (fn === 'business_health') return 'error' in health ? { data: null, error: { message: health.error, code: 'P0001' } } : { data: health, error: null }
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

  it('single-person team (B11): the hidden unpaid amount is said to be hidden, never "not approved"; no team-earnings driver', async () => {
    serve({ ...base, current: { ...cur, team_earnings_minor: null, unpaid_team_minor: null, private_fields: ['team_earnings_minor', 'unpaid_team_minor'] },
      changes: { ...base.changes, previous: { ...base.changes.previous!, team_earnings_minor: { delta_minor: null, percent: null } } },
      open_periods: [{ ...base.open_periods[0]!, unpaid_team_minor: null, unpaid_private: true }] }, status({ view: 'self' }))
    renderAt()
    const o = await screen.findByTestId('overview')
    expect(within(o).getAllByRole('definition').map((d) => d.textContent)[3]).toBe('Não mostrado')
    expect(screen.getByTestId('team-private').textContent).toContain('uma só pessoa')
    expect(within(o).getAllByRole('definition').map((d) => d.textContent)[1]).toContain('38.500')   // result stays
    expect(screen.queryByText(/Ganhos da equipa/)).toBeNull()
    expect(screen.queryAllByTestId('insight').map((i) => i.dataset.kind)).not.toContain('payments_pending')
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
