// Stock migration (UX slice 6): the shared mobile patterns on Stock, Lista, Mercado, Passagem and Rever — whole rows,
// no glyph controls, sheets that close on back, a trip that survives navigation, no dead ends after completion.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { StockProduct } from '../../modules/stock/api'
import { buildTrip, loadTrip, saveTrip, toggle } from '../../modules/stock/trip'
import { renderScreen, testOrg } from '../../test/router'

vi.mock('../../modules/stock/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/stock/api')>()),
  getStockOverview: vi.fn(), updateStock: vi.fn().mockResolvedValue(undefined), createProduct: vi.fn(), getProductHistory: vi.fn(),
}))
import { getStockOverview, updateStock } from '../../modules/stock/api'
import { StockPage } from './StockPage'
import { ListPage } from './ListPage'
import { HandoffPage, MarketPage } from './MarketPage'
import { ReviewPage } from './ReviewPage'

const p = (id: string, name: string, over: Partial<StockProduct> = {}): StockProduct => ({
  id, name, unit_word: 'garrafão', purpose: null, state: 'ok', level: null, reserve_units: 0, marked_at: null,
  on_list: false, planned_qty: null, urgent: false, last_purchase: null, bought_today: null, ...over,
})
const GLYPHS = /[☰⌂▾▴✓⋯×−]/
const noGlyphControls = () => {
  for (const b of screen.getAllByRole('button')) expect(b.textContent ?? '').not.toMatch(GLYPHS)
}
beforeEach(() => { vi.mocked(getStockOverview).mockReset(); vi.mocked(updateStock).mockReset().mockResolvedValue(undefined); localStorage.clear() })

describe('Stock home on the shared patterns', () => {
  const products = [
    p('t', 'Tinta preta', { state: 'baixo' }), p('l', 'Lâminas', { state: 'comprar', urgent: true, on_list: true }),
    p('s', 'Shampoo 5 L', { state: 'comprar', on_list: true }), p('a', 'Acetona'),
  ]
  it('urgent → Atenção (Comprar before Baixo) → Em ordem collapsed; rows are whole tappable rows; no glyphs', async () => {
    vi.mocked(getStockOverview).mockResolvedValue(products)
    renderScreen('/stock', <StockPage />, { entries: ['/', '/stock'], index: 1 })
    await screen.findByText('Lâminas')
    const labels = [...document.querySelectorAll('main .label, main .group-toggle .label')].map((e) => e.textContent)
    expect(labels).toEqual(['Estado aproximado · marcado pela equipa', 'Urgente · comprar já', 'Atenção', 'Em ordem · 1'])
    const attention = screen.getByText('Atenção').parentElement!
    const rows = within(attention).getAllByRole('button')
    expect(rows.map((b) => b.className)).toEqual(['row row-with-subtitle row-tappable', 'row row-with-subtitle row-tappable'])
    expect(rows.map((b) => b.querySelector('.row-title')?.textContent)).toEqual(['Shampoo 5 L', 'Tinta preta'])
    expect(within(rows[1]!).getByText('Baixo').className).toBe('status-chip status-caution')
    expect(within(rows[0]!).getByText('Comprar').className).toBe('status-chip status-warning')
    expect(screen.getByRole('button', { name: 'Em ordem · 1' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: 'Preparar compra · 2 produtos' }).closest('.bottom-bar')).toBeTruthy()
    noGlyphControls()
  })
  it('unsaved product edits are not dropped by Android back: "Descartar as alterações?" first; Continuar a editar keeps them', async () => {
    vi.mocked(getStockOverview).mockResolvedValue(products)
    const { router } = renderScreen('/stock', <StockPage />, { entries: ['/', '/stock'], index: 1 })
    fireEvent.click(await screen.findByText('Tinta preta'))
    const sheet = await screen.findByRole('dialog', { name: 'Tinta preta' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Comprar' }))
    await act(() => router.navigate(-1))
    expect(await screen.findByRole('dialog', { name: 'Descartar as alterações?' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/stock')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a editar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descartar as alterações?' })).toBeNull())
    const still = screen.getByRole('dialog', { name: 'Tinta preta' })
    expect(within(still).getByRole('button', { name: 'Comprar' }).getAttribute('aria-pressed')).toBe('true')
    await act(() => router.navigate(-1))
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(updateStock).not.toHaveBeenCalled()
  })
  it('a clean product sheet closes with Android back and stays on Stock', async () => {
    vi.mocked(getStockOverview).mockResolvedValue(products)
    const { router } = renderScreen('/stock', <StockPage />, { entries: ['/', '/stock'], index: 1 })
    fireEvent.click(await screen.findByRole('button', { name: 'Em ordem · 1' }))           // collapsed while something needs attention
    fireEvent.click(await screen.findByText('Acetona'))
    await screen.findByRole('dialog', { name: 'Acetona' })
    await act(() => router.navigate(-1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/stock')
  })
})

describe('Lista on the shared patterns', () => {
  const listed = [p('s', 'Shampoo 5 L', { state: 'comprar', on_list: true, planned_qty: 2, urgent: true }), p('g', 'Gel', { on_list: true, planned_qty: 1 }), p('t', 'Tinta preta', { state: 'baixo' })]
  it('a whole row opens the entry; "Tirar da lista" is a deliberate destructive action with Desfazer that restores it exactly', async () => {
    vi.mocked(getStockOverview).mockResolvedValue(listed)
    renderScreen('/stock/lista', <ListPage />, { entries: ['/', '/stock', '/stock/lista'], index: 2 })
    await screen.findByText('Shampoo 5 L')
    noGlyphControls()
    expect(screen.queryByRole('button', { name: /Tirar Shampoo/ })).toBeNull()                 // no small × on the row
    fireEvent.click(screen.getByRole('button', { name: /^Shampoo 5 L/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Shampoo 5 L' })
    const remove = within(sheet).getByRole('button', { name: 'Tirar da lista' })
    expect(remove.className).toBe('btn btn-destructive')
    fireEvent.click(remove)
    await waitFor(() => expect(updateStock).toHaveBeenCalledWith('s', { on_list: false, urgent: false, planned_qty: null }))
    const notice = (await screen.findByText('Shampoo 5 L saiu da lista.')).parentElement!
    expect(notice.getAttribute('role')).toBe('status')
    fireEvent.click(within(notice).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(updateStock).toHaveBeenLastCalledWith('s', { on_list: true, planned_qty: 2, urgent: true }))
  })
  it('the "Levar" stepper is one tap on a 48px control; a suggested «baixo» row joins the list as a whole row', async () => {
    vi.mocked(getStockOverview).mockResolvedValue(listed)
    renderScreen('/stock/lista', <ListPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mais Gel' }))
    await waitFor(() => expect(updateStock).toHaveBeenCalledWith('g', { planned_qty: 2 }))
    expect(screen.getByRole('button', { name: 'Mais Gel' }).className).toBe('step')
    fireEvent.click(screen.getByRole('button', { name: 'Juntar Tinta preta' }))
    await waitFor(() => expect(updateStock).toHaveBeenCalledWith('t', { on_list: true }))
    expect(screen.getByRole('button', { name: 'Ir às compras' }).closest('.bottom-bar')).toBeTruthy()
  })
})

describe('Modo mercado on the shared patterns', () => {
  const list = [p('s', 'Shampoo 5 L', { on_list: true, planned_qty: 2 }), p('g', 'Gel', { on_list: true, planned_qty: 1 })]
  it('tapping anywhere on the row toggles «comprado»; the draft survives going back to the list and in again', async () => {
    vi.mocked(getStockOverview).mockResolvedValue(list)
    const { router } = renderScreen('/stock/mercado', <MarketPage />, {
      entries: ['/', '/stock/lista', '/stock/mercado'], index: 2, routes: [{ path: '/stock/lista', element: <p>Lista</p> }],
    })
    const row = (await screen.findByText('Shampoo 5 L')).closest('button')!
    expect(row.className).toContain('row-market')
    fireEvent.click(within(row).getByText('2 garrafão'))                                        // the quantity, not a checkbox
    expect(row.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('progress').textContent).toBe('1 de 2')
    expect(loadTrip(testOrg.id)?.items.find((i) => i.name === 'Shampoo 5 L')?.status).toBe('bought')
    noGlyphControls()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))                            // app-bar back: history
    expect(await screen.findByText('Lista')).toBeTruthy()
    expect(router.state.historyAction).toBe('POP')
    await act(() => router.navigate(1))                                                        // and in again
    const again = (await screen.findByText('Shampoo 5 L')).closest('button')!
    expect(again.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Terminar e registar compra' }).closest('.bottom-bar')).toBeTruthy()
  })
  it('the options sheet closes with Android back and the trip stays as it was', async () => {
    vi.mocked(getStockOverview).mockResolvedValue(list)
    const { router } = renderScreen('/stock/mercado', <MarketPage />, { entries: ['/stock/lista', '/stock/mercado'], index: 1 })
    fireEvent.click(await screen.findByRole('button', { name: 'Opções: Gel' }))
    await screen.findByRole('dialog', { name: 'Gel' })
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    await act(() => router.navigate(-1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/stock/mercado')
    expect(loadTrip(testOrg.id)?.items.find((i) => i.name === 'Gel')?.qty).toBe(2)            // the change made in the sheet is kept
  })
})

describe('Passagem', () => {
  const list = [p('s', 'Shampoo 5 L', { on_list: true, planned_qty: 2 }), p('t', 'Tinta preta', { on_list: true, planned_qty: 1 })]
  it('shows what goes to the purchase and what does not; continues into Compra carrying the trip; changes nothing in Stock', async () => {
    let t = buildTrip(list, null)
    t = toggle(t, t.items.find((i) => i.name === 'Shampoo 5 L')!.key)
    saveTrip(testOrg.id, t)
    const { router } = renderScreen('/stock/passagem', <HandoffPage />, {
      entries: ['/stock/mercado', '/stock/passagem'], index: 1, routes: [{ path: '/dinheiro/compra', element: <p>Compra</p> }],
    })
    const go = screen.getByText('Vai para a compra').parentElement!
    expect(within(go).getByText('Shampoo 5 L')).toBeTruthy()
    expect(within(go).getByText('2 garrafão')).toBeTruthy()
    expect(within(screen.getByText('Não comprado · fica marcado em Stock').parentElement!).getByText('Tinta preta')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para Registar compra' }))
    expect(await screen.findByText('Compra')).toBeTruthy()
    expect(router.state.location.state).toEqual({ fromTrip: true })
    expect(updateStock).not.toHaveBeenCalled()
  })
  it('with nothing bought (e.g. back here after the purchase was recorded) it is replaced by Stock — no dead end', async () => {
    const { router } = renderScreen('/stock/passagem', <HandoffPage />, { entries: ['/stock/mercado', '/stock/passagem'], index: 1, routes: [{ path: '/stock', element: <p>Stock home</p> }] })
    expect(await screen.findByText('Stock home')).toBeTruthy()
    expect(router.state.historyAction).toBe('REPLACE')
  })
})

describe('Rever stock on the shared patterns', () => {
  const entries = [{ pathname: '/stock/rever', state: { lines: [{ name: 'Shampoo', quantity: 2, unitWord: 'garrafão', insteadOf: null }] } }]
  it('a successful save says "Guardado · Baixo"; Concluir replaces Rever with Stock (the task is over)', async () => {
    vi.mocked(getStockOverview).mockResolvedValue([p('s', 'Shampoo', { state: 'comprar' })])
    const { router } = renderScreen('/stock/rever', <ReviewPage />, { entries, routes: [{ path: '/stock', element: <p>Stock home</p> }] })
    const group = await screen.findByRole('group', { name: 'Estado de Shampoo' })
    fireEvent.click(within(group).getByRole('button', { name: 'Baixo' }))
    expect(await screen.findByText('Guardado · Baixo')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(await screen.findByText('Stock home')).toBeTruthy()
    expect(router.state.historyAction).toBe('REPLACE')
  })
})
