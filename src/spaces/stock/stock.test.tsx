import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import type { StockProduct } from '../../modules/stock/api'

vi.mock('../../modules/stock/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/stock/api')>()),
  getStockOverview: vi.fn(), updateStock: vi.fn().mockResolvedValue(undefined), getProductHistory: vi.fn(),
}))
import { getProductHistory, getStockOverview, updateStock } from '../../modules/stock/api'
import { StockPage } from './StockPage'

const org = { id: 'o', name: 'Org', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const p = (id: string, name: string, over: Partial<StockProduct> = {}): StockProduct => ({
  id, name, unit_word: 'garrafão', purpose: null, state: 'ok', level: null, reserve_units: 0, marked_at: null,
  on_list: false, planned_qty: null, urgent: false, last_purchase: null, bought_today: null, ...over,
})
const renderIt = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <OrganizationContext.Provider value={org}><MemoryRouter><StockPage /></MemoryRouter></OrganizationContext.Provider>
  </QueryClientProvider>,
)
beforeEach(() => vi.mocked(updateStock).mockClear())

describe('StockPage', () => {
  it('shows attention first: urgent, then Comprar before Baixo, then a collapsed Em ordem', async () => {
    vi.mocked(getStockOverview).mockResolvedValue([
      p('t', 'Tinta preta', { state: 'baixo', level: 'metade' }),
      p('l', 'Lâminas', { state: 'comprar', level: 'vazio', urgent: true, on_list: true }),
      p('c', 'Cera depilatória', { state: 'comprar', level: 'quase_vazio', bought_today: { quantity: 2, unit_word: 'unid.' } }),
      p('s', 'Shampoo 5 L', { state: 'comprar', on_list: true }),
      p('a', 'Acetona', { level: 'cheio', reserve_units: 1 }),
    ])
    renderIt()
    expect(await screen.findByText('Preparar compra · 2 produtos')).toBeTruthy()
    const urgent = screen.getByText('Urgente · comprar já').parentElement!
    expect(within(urgent).getByText('Lâminas')).toBeTruthy()
    const attention = screen.getByText('Atenção').parentElement!
    expect(within(attention).getAllByRole('button').map((b) => b.querySelector('strong')?.textContent)).toEqual(['Cera depilatória', 'Shampoo 5 L', 'Tinta preta'])
    expect(within(attention).getByText('comprado hoje · 2 unid. · quase vazio')).toBeTruthy()   // a fact beside an unchanged mark
    expect(screen.getByText('Em ordem · 1')).toBeTruthy()
    expect(screen.queryByText('Acetona')).toBeNull()
  })
  it('nothing needs attention: green line and Em ordem expanded with level / reserve notes', async () => {
    vi.mocked(getStockOverview).mockResolvedValue([p('a', 'Acetona', { level: 'cheio', reserve_units: 1 }), p('w', 'Toalhas', { unit_word: 'unid.', reserve_units: 4 }), p('x', 'Lâminas', { unit_word: 'caixa' })])
    renderIt()
    expect(await screen.findByText('Nada marcado como baixo ou a comprar.')).toBeTruthy()
    expect(screen.getByText('cheio · 1 em reserva')).toBeTruthy()
    expect(screen.getByText('4 em reserva')).toBeTruthy()
    expect(screen.getByText('caixa')).toBeTruthy()
    expect(screen.getByText('Preparar compra')).toBeTruthy()
  })
  it('product sheet: Comprar also puts it on the list; Guardar writes only what changed', async () => {
    vi.mocked(getStockOverview).mockResolvedValue([p('c', 'Condicionador 5 L', { state: 'baixo', level: 'metade', reserve_units: 1, purpose: 'Cabelo' })])
    renderIt()
    fireEvent.click(await screen.findByText('Condicionador 5 L'))
    expect(screen.getByText('Cabelo · garrafão')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: 'Estado do produto' })).getByText('Comprar'))
    fireEvent.click(screen.getByLabelText('Mais em reserva'))
    fireEvent.click(screen.getByText('Quase vazio'))
    fireEvent.click(screen.getByText('Guardar'))
    await waitFor(() => expect(updateStock).toHaveBeenCalledWith('c', { state: 'comprar', level: 'quase_vazio', reserve_units: 2, on_list: true }))
  })
  it('purchase history sheet shows line cost and where, the mark observation, and no who-paid', async () => {
    vi.mocked(getStockOverview).mockResolvedValue([p('c', 'Condicionador 5 L', { state: 'baixo',
      last_purchase: { occurred_at: '2026-08-10T10:00:00Z', quantity: 2, unit_word: 'garrafão', line_cost_minor: 1300000, origin: 'Mercado' } })])
    vi.mocked(getProductHistory).mockResolvedValue({
      purchases: [{ occurred_at: '2026-08-10T10:00:00Z', quantity: 2, unit_word: 'garrafão', line_cost_minor: 1300000, origin: 'Mercado' }],
      mark: { state: 'baixo', marked_at: '2026-10-04T09:00:00Z', days_after_purchase: 55 },
    })
    renderIt()
    fireEvent.click(await screen.findByText('Condicionador 5 L'))
    expect(screen.getByText('10 ago · 2 garrafão · 13.000 Kz · Mercado')).toBeTruthy()
    fireEvent.click(screen.getByText('Ver'))
    expect(await screen.findByText('Compras · Condicionador 5 L')).toBeTruthy()
    expect(await screen.findByText('Marcado «baixo»')).toBeTruthy()
    expect(screen.getByText('4 out · 55 dias depois da compra')).toBeTruthy()
    expect(screen.getByText(/Quem pagou não aparece aqui/)).toBeTruthy()
  })
})
