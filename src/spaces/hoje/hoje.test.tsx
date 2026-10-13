import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import { renderScreen } from '../../test/router'

vi.mock('../../modules/services/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/services/api')>()),
  getHojeSummary: vi.fn().mockResolvedValue({ total: 0, by_method: [], last_at: null, recent: [] }),
}))
vi.mock('../../modules/stock/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/stock/api')>()),
  countMarkedToBuy: vi.fn().mockResolvedValue(2),
}))
import { HojePage } from './HojePage'

const org = { id: 'o', name: 'Org', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const renderIt = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <OrganizationContext.Provider value={org}><MemoryRouter><HojePage /></MemoryRouter></OrganizationContext.Provider>
  </QueryClientProvider>,
)
const href = (el: HTMLElement) => el.getAttribute('href')

describe('Hoje', () => {
  it('Registar serviço is the main action; every secondary destination is still reachable, grouped', async () => {
    renderIt()
    expect(href(screen.getByRole('link', { name: 'Registar serviço' }))).toBe('/servicos/registar')
    const other = screen.getByRole('navigation', { name: 'Outras ações' })
    expect(href(within(other).getByRole('link', { name: 'Adiantamento' }))).toBe('/equipa/adiantamento')
    expect(within(other).getByRole('button', { name: 'Despesa ou compra' })).toBeTruthy()
    expect(href(within(other).getByRole('link', { name: 'Stock' }))).toBe('/stock')
    const priv = screen.getByRole('navigation', { name: 'Privado' })
    expect(within(priv).getAllByRole('link').map(href)).toEqual(['/privado/entrar', '/privado/fecho', '/privado/negocio'])
    expect(within(priv).getAllByRole('link').map((a) => a.textContent)).toEqual(['Área privada›', 'Fecho›', 'Negócio›'])
    expect(await screen.findByText('2 produtos marcados a comprar')).toBeTruthy()
    expect(await screen.findByText('Ainda não há serviços registados hoje.')).toBeTruthy()
  })

  it('Despesa ou compra opens the chooser, which can be cancelled', () => {
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: 'Despesa ou compra' }))
    const sheet = screen.getByRole('dialog', { name: 'O que quer registar?' })
    expect(within(sheet).getByRole('button', { name: /Registar despesa/ })).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: /Registar compra/ })).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the chooser closes with Android back; choosing replaces it, so back from the flow returns to Hoje', async () => {
    const { router } = renderScreen('/inicio', <HojePage />, { routes: [{ path: '/dinheiro/despesa', element: <p>Despesa</p> }] })
    fireEvent.click(screen.getByRole('button', { name: 'Despesa ou compra' }))
    await screen.findByRole('dialog', { name: 'O que quer registar?' })
    await act(() => router.navigate(-1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/inicio')
    fireEvent.click(screen.getByRole('button', { name: 'Despesa ou compra' }))
    fireEvent.click(await screen.findByRole('button', { name: /Registar despesa/ }))
    expect(await screen.findByText('Despesa')).toBeTruthy()
    expect(router.state.location.state).toEqual({ from: '/' })
    await act(() => router.navigate(-1))
    expect(await screen.findByRole('button', { name: 'Despesa ou compra' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
