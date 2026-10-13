// Stock screens: loading is never shown as empty, a failed load is said and retried, a failed save is visible.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { StockProduct } from '../../modules/stock/api'
import { renderScreen } from '../../test/router'

vi.mock('../../modules/stock/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/stock/api')>()),
  getStockOverview: vi.fn(), updateStock: vi.fn(), createProduct: vi.fn(), getProductHistory: vi.fn(),
}))
import { getStockOverview, updateStock } from '../../modules/stock/api'
import { StockPage } from './StockPage'
import { ListPage } from './ListPage'
import { MarketPage } from './MarketPage'
import { ReviewPage } from './ReviewPage'

const p = (id: string, name: string, over: Partial<StockProduct> = {}): StockProduct => ({
  id, name, unit_word: 'garrafão', purpose: null, state: 'ok', level: null, reserve_units: 0, marked_at: null,
  on_list: false, planned_qty: null, urgent: false, last_purchase: null, bought_today: null, ...over,
})
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const loading = () => screen.queryByRole('status', { name: 'A carregar' })
beforeEach(() => { vi.mocked(getStockOverview).mockReset(); vi.mocked(updateStock).mockReset(); localStorage.clear() })

describe('Stock home', () => {
  it('while loading: a skeleton, neither the calm line nor the empty state; then the content', async () => {
    const d = deferred<StockProduct[]>()
    vi.mocked(getStockOverview).mockReturnValueOnce(d.promise)
    renderScreen('/stock', <StockPage />)
    expect(loading()).toBeTruthy()
    expect(screen.queryByText('Nada marcado como baixo ou a comprar.')).toBeNull()
    expect(screen.queryByText('Ainda sem produtos')).toBeNull()
    await act(async () => { d.resolve([p('s', 'Shampoo 5 L', { state: 'baixo' })]) })
    expect(await screen.findByText('Shampoo 5 L')).toBeTruthy()
    expect(loading()).toBeNull()
  })
  it('a failed load is an error with Retry; the retry renders the content', async () => {
    vi.mocked(getStockOverview).mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([p('s', 'Shampoo 5 L')])
    renderScreen('/stock', <StockPage />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Não foi possível carregar o Stock.')
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Shampoo 5 L')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('no products at all is its own empty state, not "nothing to buy"', async () => {
    vi.mocked(getStockOverview).mockResolvedValueOnce([])
    renderScreen('/stock', <StockPage />)
    expect(await screen.findByText('Ainda sem produtos')).toBeTruthy()
    expect(screen.queryByText('Nada marcado como baixo ou a comprar.')).toBeNull()
  })
})

describe('Lista de compra', () => {
  it('while loading there is no "Lista vazia" / "Nada na lista"; a genuinely empty list shows both after success', async () => {
    const d = deferred<StockProduct[]>()
    vi.mocked(getStockOverview).mockReturnValueOnce(d.promise)
    renderScreen('/stock/lista', <ListPage />)
    expect(loading()).toBeTruthy()
    expect(screen.queryByText('Lista vazia.')).toBeNull()
    expect(screen.queryByText('Nada na lista')).toBeNull()
    await act(async () => { d.resolve([p('a', 'Acetona')]) })
    expect(await screen.findByText('Nada na lista')).toBeTruthy()
    expect(screen.getByText('Lista vazia.')).toBeTruthy()
    expect(loading()).toBeNull()
  })
  it('a failed load is an error with Retry, never an empty list', async () => {
    vi.mocked(getStockOverview).mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([p('s', 'Shampoo 5 L', { on_list: true, planned_qty: 2 })])
    renderScreen('/stock/lista', <ListPage />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Não foi possível carregar a lista de compra.')
    expect(screen.queryByText('Lista vazia.')).toBeNull()
    expect(screen.queryByText('Nada na lista')).toBeNull()
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Shampoo 5 L')).toBeTruthy()
    expect(screen.getByText('1 produto')).toBeTruthy()
  })
})

describe('Modo mercado', () => {
  it('a failed load leaves "A carregar", explains, and Retry brings the trip', async () => {
    vi.mocked(getStockOverview).mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([p('s', 'Shampoo 5 L', { on_list: true, planned_qty: 2 })])
    renderScreen('/stock/mercado', <MarketPage />, { routes: [{ path: '/stock/lista', element: <p>Lista</p> }] })
    expect(loading()).toBeTruthy()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Não foi possível carregar a lista de compra.')
    expect(loading()).toBeNull()
    expect(within(alert).getByRole('button', { name: 'Voltar à lista' })).toBeTruthy()
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Shampoo 5 L')).toBeTruthy()
    expect(screen.getByText('Marque o que vai comprando.')).toBeTruthy()
  })
})

describe('Rever stock', () => {
  const entries = [{ pathname: '/stock/rever', state: { lines: [{ name: 'Shampoo', quantity: 2, unitWord: 'garrafão', insteadOf: null }] } }]
  it('a failed save is visible with Retry; the state stays as the server has it', async () => {
    vi.mocked(getStockOverview).mockResolvedValue([p('s', 'Shampoo', { state: 'comprar' })])
    vi.mocked(updateStock).mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(undefined)
    renderScreen('/stock/rever', <ReviewPage />, { entries })
    const group = await screen.findByRole('group', { name: 'Estado de Shampoo' })
    fireEvent.click(within(group).getByRole('button', { name: 'Baixo' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Não foi possível guardar «Baixo» em Shampoo. O estado ficou como estava.')
    await waitFor(() => expect(within(group).getByRole('button', { name: 'Comprar' }).getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(vi.mocked(updateStock).mock.calls).toEqual([['s', { state: 'baixo' }], ['s', { state: 'baixo' }]])
  })
  it('loading shows a skeleton, not an empty review; a reload with nothing to review says so', async () => {
    const d = deferred<StockProduct[]>()
    vi.mocked(getStockOverview).mockReturnValueOnce(d.promise)
    renderScreen('/stock/rever', <ReviewPage />)
    expect(loading()).toBeTruthy()
    expect(screen.queryByText('Nada para rever')).toBeNull()
    await act(async () => { d.resolve([]) })
    expect(await screen.findByText('Nada para rever')).toBeTruthy()
    expect(screen.getByText('Esta revisão abre a seguir a uma compra feita a partir do Stock.')).toBeTruthy()
  })
})
