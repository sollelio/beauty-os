import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import type { Situation } from '../../modules/team/situation'

const rpc = vi.fn()
vi.mock('../../shared/supabase/client', () => ({ getSupabase: () => ({ rpc }) }))
import { PrivateGate } from '../../app/PrivateGate'
import { SituationPage } from './SituationPage'

const org = { id: 'o', name: 'Org', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const K = (kz: number) => kz * 100
const base: Situation = {
  view: 'manager',
  person: { id: 'n1', display_name: 'Nádia', capabilities: ['Cabelo', 'Unhas'] },
  period: { id: 'p10', label: 'Outubro', state: 'aberto', starts_on: '2026-10-01', ends_on: '2026-10-31' },
  production: { count: 15, total_minor: K(100000) },
  rule: { kind: 'standing', percent: 70, salon_percent: 30, set_at: '2026-10-01T08:00:00Z', set_by: 'Mercy' },
  earned_minor: K(70000),
  advances: { count: 2, total_minor: K(25000) },
  payments: { count: 0, total_minor: 0, last: null },
  difference_minor: K(45000), remaining_minor: K(45000), excess_minor: 0,
  contributions: { count: 1, total_minor: K(8500) },
}
const active = (expiresInMs = 300_000) => ({ active: true, person_id: 'm1', display_name: 'Mercy', view: 'manager', expires_at: new Date(Date.now() + expiresInMs).toISOString() })

function serve(situation: Situation | (() => Promise<never>), status = active()) {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === 'private_context_status') return { data: status, error: null }
    if (fn === 'end_private_context') return { data: { ok: true }, error: null }
    if (fn === 'team_situation') return typeof situation === 'function' ? situation() : { data: situation, error: null }
    if (fn === 'team_history') return { data: { total_count: 0, rows: [] }, error: null }
    return { data: [], error: null }
  })
}
function renderAt(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={qc}>
      <OrganizationContext.Provider value={org}>
        <MemoryRouter initialEntries={['/privado/situacao/n1']}>
          <Routes>
            <Route path="/privado" element={<PrivateGate />}><Route path="situacao/:personId" element={<SituationPage />} /></Route>
            <Route path="/privado/entrar" element={<p>Entrada privada</p>} />
            <Route path="/" element={<p>Hoje</p>} />
          </Routes>
        </MemoryRouter>
      </OrganizationContext.Provider>
    </QueryClientProvider>,
  )
  return qc
}

beforeEach(() => rpc.mockReset())

describe('SituationPage', () => {
  it('shows the headline with its derivation and the numbered explanation', async () => {
    serve(base)
    renderAt()
    expect((await screen.findByTestId('remaining')).textContent).toBe('45.000 Kz')
    expect(screen.getByTestId('derivation').textContent).toBe('= ganho 70.000 − adiantamentos 25.000 − pagamentos 0')
    expect(screen.getByText('70% para Nádia · 30% para o salão · definida em 1 out')).toBeTruthy()
    expect(screen.getByText('70% × 100.000')).toBeTruthy()
    expect(screen.getByText('−25.000 Kz')).toBeTruthy()
    fireEvent.click(screen.getByText('Como se chega a este valor? ›'))
    const steps = within(screen.getByTestId('explanation')).getAllByRole('listitem').map((li) => li.textContent)
    expect(steps).toEqual([
      'Produção do período15 serviços registados = 100.000 Kz',
      'Regra deste período70% para Nádia · 30% para o salão · definida por Mercy em 1 out',
      'Ganho70% × 100.000 = 70.000 Kz',
      'Adiantamentos recebidos2 adiantamentos = 25.000 Kz',
      'Pagamentos feitosNenhum neste período',
      'Falta receber70.000 − 25.000 − 0 = 45.000 Kz',
    ])
    expect(screen.getByRole('heading', { name: 'Como se chega a 45.000 Kz?' })).toBeTruthy()
    expect(screen.getByText('Contribuições em compras (8.500 Kz) ficam à parte e não entram neste cálculo.')).toBeTruthy()
  })

  it('self view: "para si", no attributions', async () => {
    serve({ ...base, view: 'self', rule: { ...base.rule, set_by: null } as Situation['rule'] })
    renderAt()
    expect(await screen.findByText('70% para si · 30% para o salão')).toBeTruthy()
    expect(screen.getByText('A minha situação')).toBeTruthy()
    expect(screen.queryByText(/definida/)).toBeNull()
    expect(screen.getByText('Vê apenas os seus registos. Se algum valor não bater certo, fale com a gestão.')).toBeTruthy()
  })

  it('pending rule: "—", no earned or remaining figure, advances unsigned', async () => {
    serve({ ...base, rule: { kind: 'contextual', percent: null, salon_percent: null, set_at: '2026-10-01T08:00:00Z', set_by: 'Mercy' },
      earned_minor: null, remaining_minor: null, excess_minor: null, difference_minor: null, advances: { count: 1, total_minor: K(10000) } })
    renderAt()
    expect((await screen.findByTestId('remaining')).textContent).toBe('—')
    expect(screen.getByText('Por determinar: a regra deste período ainda não foi definida.')).toBeTruthy()
    expect(screen.getByText('Por determinar')).toBeTruthy()
    expect(screen.getByText('Depende da regra')).toBeTruthy()
    expect(screen.getByText(/Até a regra ser definida não há valor ganho nem valor a receber/)).toBeTruthy()
    expect(screen.getByText('1 adiantamento · descontado quando a regra for definida')).toBeTruthy()
    expect(screen.getByText('10.000 Kz')).toBeTruthy()
    expect(screen.queryByText('−10.000 Kz')).toBeNull()
    expect(screen.queryByTestId('derivation')).toBeNull()
    fireEvent.click(screen.getByTestId('remaining'))
    expect(screen.getByRole('heading', { name: 'Porque não há valor a receber?' })).toBeTruthy()
    expect(within(screen.getByTestId('explanation')).getAllByRole('listitem')).toHaveLength(4)
  })

  it('excess: shows 0 with the real arithmetic and a neutral notice, never a negative payable', async () => {
    serve({ ...base, earned_minor: K(6000), production: { count: 3, total_minor: K(12000) }, rule: { ...base.rule, percent: 50, salon_percent: 50 } as Situation['rule'],
      advances: { count: 1, total_minor: K(8000) }, difference_minor: K(-2000), remaining_minor: 0, excess_minor: K(2000), contributions: { count: 0, total_minor: 0 } })
    renderAt()
    expect((await screen.findByTestId('remaining')).textContent).toBe('0 Kz')
    expect(screen.getByTestId('derivation').textContent).toBe('ganho 6.000 − adiantamentos 8.000 − pagamentos 0 = −2.000')
    expect(screen.getByText('Recebeu mais do que o ganho até agora (2.000 Kz). O que acontece a essa diferença é decidido pela gestão.')).toBeTruthy()
    fireEvent.click(screen.getByTestId('remaining'))
    expect(screen.getByRole('heading', { name: 'Porque mostra 0 Kz?' })).toBeTruthy()
    expect(screen.getByText('6.000 − 8.000 − 0 = −2.000 Kz → mostra 0; a diferença é decidida pela gestão')).toBeTruthy()
  })
})

describe('private data lifetime', () => {
  const cached = (qc: QueryClient) => qc.getQueryCache().findAll({ queryKey: ['private', 'situation'] }).length

  it('removes the data and leaves the private area when the context expires', async () => {
    serve(base, active(600))
    const qc = renderAt()
    expect(await screen.findByTestId('remaining')).toBeTruthy()
    expect(cached(qc)).toBe(1)
    expect(await screen.findByText('Entrada privada', {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.queryByText('45.000 Kz')).toBeNull()
    expect(cached(qc)).toBe(0)
  })

  it('removes the data when the server reports the context is gone', async () => {
    let calls = 0
    serve(base)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'private_context_status') return { data: calls++ === 0 ? active() : { active: false }, error: null }
      if (fn === 'team_situation') return { data: null, error: { message: 'VERIFICATION_REQUIRED', code: 'P0001' } }
      return { data: { ok: true }, error: null }
    })
    renderAt(qc)
    expect(await screen.findByText('Entrada privada')).toBeTruthy()
    expect(cached(qc)).toBe(0)
  })

  it('a stale cached "inactive" status never ends a context that was just opened (gate visited before entering)', async () => {
    serve(base)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(['org', 'private-status'], { active: false })
    await qc.invalidateQueries({ queryKey: ['org', 'private-status'], refetchType: 'none' })     // stale, as after a previous exit
    renderAt(qc)
    expect(await screen.findByTestId('remaining')).toBeTruthy()
    expect(screen.queryByText('Entrada privada')).toBeNull()
    expect(rpc).not.toHaveBeenCalledWith('end_private_context')
  })

  it('explicit exit ends the context server-side and clears the cache', async () => {
    serve(base)
    const qc = renderAt()
    await screen.findByTestId('remaining')
    fireEvent.click(screen.getByText('Sair da área privada'))
    await screen.findByText('Hoje')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('end_private_context'))
    expect(cached(qc)).toBe(0)
  })
})
