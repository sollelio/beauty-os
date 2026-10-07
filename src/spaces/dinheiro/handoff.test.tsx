// Slice 05 → Slice 03 handoff: P1 pre-filled from the trip draft; the draft is cleared only after the purchase is
// recorded; a failed purchase keeps it; the human stock state is never written.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import { AppError } from '../../shared/errors'
import { buildTrip, loadTrip, saveTrip, substitute, toggle } from '../../modules/stock/trip'
import type { StockProduct } from '../../modules/stock/api'

vi.mock('../../modules/org/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/org/api')>()),
  listConfirmers: vi.fn().mockResolvedValue([{ id: 'c1', display_name: 'Duarte' }]),
  listPeople: vi.fn().mockResolvedValue([]), verifyPerson: vi.fn().mockResolvedValue('g1'),
}))
vi.mock('../../modules/stock/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/stock/api')>()),
  listProducts: vi.fn().mockResolvedValue([]), listUnitWords: vi.fn().mockResolvedValue(['garrafão']),
  updateStock: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../modules/purchasing/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/purchasing/api')>()),
  listPurchaseOrigins: vi.fn().mockResolvedValue([]), recordPurchase: vi.fn(),
}))
import { updateStock } from '../../modules/stock/api'
import { recordPurchase } from '../../modules/purchasing/api'
import { PurchaseFlow } from './PurchaseFlow'

const org = { id: 'o', name: 'Org', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const p = (id: string, name: string, unit: string, qty: number): StockProduct => ({ id, name, unit_word: unit, purpose: null, state: 'comprar',
  level: null, reserve_units: 0, marked_at: null, on_list: true, planned_qty: qty, urgent: false, last_purchase: null, bought_today: null })

function seedTrip() {
  let t = buildTrip([p('s5', 'Shampoo 5 L', 'garrafão', 2), p('g', 'Gel para unhas', 'frasco', 3), p('t', 'Tinta preta', 'tubo', 2)], null)
  t = substitute(t, t.items[0]!.key, { productId: 's3', name: 'Shampoo 3 L', unitWord: 'garrafão' })
  t = toggle(t, t.items[1]!.key)                                         // Gel bought; Tinta preta not bought
  saveTrip(org.id, t)
}
const renderIt = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <OrganizationContext.Provider value={org}>
      <MemoryRouter initialEntries={[{ pathname: '/dinheiro/compra', state: { fromTrip: true } }]}>
        <Routes><Route path="/dinheiro/compra" element={<PurchaseFlow />} /><Route path="/stock/rever" element={<p>Rever</p>} /></Routes>
      </MemoryRouter>
    </OrganizationContext.Provider>
  </QueryClientProvider>,
)
async function fillAndConfirm() {
  expect(screen.getByText('Pré-preenchido pela lista de compras. Ajuste as quantidades e introduza o que pagou por cada linha.')).toBeTruthy()
  expect(screen.getByText('2 × garrafão · em vez de Shampoo 5 L')).toBeTruthy()
  expect(screen.getAllByText('custo por introduzir')).toHaveLength(2)
  expect((screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement).disabled).toBe(true)   // costs start empty
  for (const [name, cost] of [['Shampoo 3 L', '9000'], ['Gel para unhas', '7500']] as const) {
    fireEvent.click(screen.getByText(name))
    fireEvent.change(screen.getByLabelText('Quanto pagou por estas unidades'), { target: { value: cost } })
    fireEvent.click(screen.getByText('Guardar alteração'))
  }
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Duarte' }))
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '135790' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra' }))
}

beforeEach(() => { localStorage.clear(); vi.mocked(updateStock).mockClear(); vi.mocked(recordPurchase).mockReset() })

describe('purchase from Modo mercado', () => {
  it('records the checked items; then clears the draft and ends only their plan entries', async () => {
    vi.mocked(recordPurchase).mockResolvedValue({ purchase_id: 'pu', occurred_at: new Date().toISOString(), total_minor: 1650000, line_count: 2,
      new_product_count: 0, salon_amount_minor: 1650000, contributors: [], confirmed_by_person_id: 'c1' })
    seedTrip()
    renderIt()
    await fillAndConfirm()
    expect(await screen.findByText('Compra registada com sucesso.')).toBeTruthy()
    expect(screen.getByText('Stock actualizado: 2 produtos')).toBeTruthy()
    expect(screen.getByText(/O estado \(OK · Baixo · Comprar\) só muda se alguém o mudar/)).toBeTruthy()
    expect(vi.mocked(recordPurchase).mock.calls[0]![2].lines).toEqual([
      { product_id: 's3', quantity: 2, line_cost_minor: 900000 }, { product_id: 'g', quantity: 3, line_cost_minor: 750000 }])
    expect(loadTrip(org.id)).toBeNull()
    await waitFor(() => expect(updateStock).toHaveBeenCalledTimes(2))
    expect(vi.mocked(updateStock).mock.calls.map((c) => c[0]).sort()).toEqual(['g', 's5'])   // Tinta preta stays listed
    for (const [, edit] of vi.mocked(updateStock).mock.calls) expect(edit).toEqual({ on_list: false })   // never the state
    fireEvent.click(screen.getByText('Rever stock · 2 produtos'))
    expect(await screen.findByText('Rever')).toBeTruthy()
  })
  it('a failed purchase keeps the draft and changes nothing in Stock', async () => {
    vi.mocked(recordPurchase).mockRejectedValue(new AppError('network', 'Failed to fetch'))
    seedTrip()
    const before = loadTrip(org.id)
    renderIt()
    await fillAndConfirm()
    expect(await screen.findByText('Não foi possível guardar. Os dados continuam aqui.')).toBeTruthy()
    expect(loadTrip(org.id)).toEqual(before)
    expect(updateStock).not.toHaveBeenCalled()
  })
})
