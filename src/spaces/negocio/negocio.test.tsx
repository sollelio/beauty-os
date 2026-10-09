import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import type { BusinessHealth, BusinessServices, BusinessTeam, Change, MetricKey, PeriodMetrics, ServiceRow } from '../../modules/business/api'

const rpc = vi.fn()
vi.mock('../../shared/supabase/client', () => ({ getSupabase: () => ({ rpc }) }))
import { PrivateGate, PrivateHome } from '../../app/PrivateGate'
import { OverviewPage } from './OverviewPage'
import { TeamPage } from './TeamPage'
import { ServicesPage } from './ServicesPage'

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
const status = (o: Record<string, unknown> = {}) => ({ active: true, person_id: 'f', display_name: 'Fernando', view: 'manager', business_health: true,
  expires_at: new Date(Date.now() + 300_000).toISOString(), ...o })

function serve(health: BusinessHealth | { error: string }, st: Record<string, unknown> = status(), tm: BusinessTeam | { error: string } = even, svs: BusinessServices = quietSv) {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === 'private_context_status') return { data: st, error: null }
    if (fn === 'end_private_context') return { data: { ok: true }, error: null }
    if (fn === 'business_health') return 'error' in health ? { data: null, error: { message: health.error, code: 'P0001' } } : { data: health, error: null }
    if (fn === 'business_team') return 'error' in tm ? { data: null, error: { message: tm.error, code: 'P0001' } } : { data: tm, error: null }
    if (fn === 'business_services') return { data: svs, error: null }
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
