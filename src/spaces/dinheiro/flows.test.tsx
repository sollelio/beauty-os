import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import { AppError } from '../../shared/errors'

vi.mock('../../modules/services/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/services/api')>()),
  listPaymentMethods: vi.fn().mockResolvedValue([{ id: 'm1', code: 'numerario', label: 'Numerário' }, { id: 'm2', code: 'transferencia', label: 'Transferência' }]),
}))
vi.mock('../../modules/org/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/org/api')>()),
  listConfirmers: vi.fn().mockResolvedValue([{ id: 'c1', display_name: 'Duarte' }]),
  listPeople: vi.fn().mockResolvedValue([{ id: 'n1', display_name: 'Nádia' }]),
  verifyPerson: vi.fn().mockResolvedValue('g1'),
}))
vi.mock('../../modules/money/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/money/api')>()),
  listExpenseCategories: vi.fn().mockResolvedValue([{ id: 'cat1', label: 'Electricidade', hint: 'Conta da luz' }]),
  recordExpense: vi.fn(),
}))
vi.mock('../../modules/stock/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/stock/api')>()),
  listProducts: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Shampoo 5 L', unit_word: 'garrafão' }]),
  listUnitWords: vi.fn().mockResolvedValue(['unid.', 'frasco']),
}))
vi.mock('../../modules/purchasing/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/purchasing/api')>()),
  listPurchaseOrigins: vi.fn().mockResolvedValue([{ id: 'o1', label: 'Mercado' }]),
  recordPurchase: vi.fn(),
}))
import { verifyPerson } from '../../modules/org/api'
import { recordExpense } from '../../modules/money/api'
import { recordPurchase } from '../../modules/purchasing/api'
import { ExpenseFlow } from './ExpenseFlow'
import { PurchaseFlow } from './PurchaseFlow'

const org = { id: 'o', name: 'Org', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const renderIt = (el: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <OrganizationContext.Provider value={org}><MemoryRouter>{el}</MemoryRouter></OrganizationContext.Provider>
  </QueryClientProvider>,
)
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
async function confirmWith() {
  fireEvent.click(await screen.findByRole('button', { name: 'Duarte' }))
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '135790' } })
}

beforeEach(() => { vi.mocked(verifyPerson).mockClear() })

describe('ExpenseFlow', () => {
  it('blocks Continuar without a value (E1) and while Misto does not add up (E6)', async () => {
    renderIt(<ExpenseFlow />)
    fireEvent.click(await screen.findByText('Electricidade'))
    expect(button('Continuar').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Valor pago'), { target: { value: '9000' } })
    expect(button('Continuar').disabled).toBe(false)
    fireEvent.click(button('Misto'))
    expect(button('Continuar').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Numerário'), { target: { value: '5000' } })
    fireEvent.change(screen.getByLabelText('Transferência'), { target: { value: '3000' } })
    expect(screen.getByTestId('mixed-sentence').textContent).toBe('Soma 8.000 Kz. Faltam 1.000 Kz para chegar aos 9.000 Kz.')
    fireEvent.change(screen.getByLabelText('Transferência'), { target: { value: '4000' } })
    expect(button('Continuar').disabled).toBe(false)
  })

  it('keeps the data after a network failure and retries with the same command_id and grant', async () => {
    vi.mocked(recordExpense).mockReset()
      .mockRejectedValueOnce(new AppError('network', 'Failed to fetch'))
      .mockResolvedValueOnce({ expense_id: 'e1', occurred_at: new Date().toISOString(), confirmed_by_person_id: 'c1' })
    renderIt(<ExpenseFlow />)
    fireEvent.click(await screen.findByText('Electricidade'))
    fireEvent.change(screen.getByLabelText('Valor pago'), { target: { value: '9000' } })
    fireEvent.click(button('Continuar'))
    await confirmWith()
    fireEvent.click(button('Confirmar despesa'))
    await screen.findByText('Não foi possível guardar. Os dados continuam aqui.')
    fireEvent.click(button('Tentar novamente'))
    await screen.findByText('Despesa registada com sucesso.')
    expect(screen.getByRole('button', { name: 'Corrigir este registo' })).toBeTruthy()          // the correction entry (pilot)
    const calls = vi.mocked(recordExpense).mock.calls
    expect(calls[0]![0]).toBe(calls[1]![0])
    expect([calls[0]![1], calls[1]![1]]).toEqual(['g1', 'g1'])
    expect(calls[0]![2]).toEqual({ categoryId: 'cat1', amountMinor: 900000, payments: [{ method_id: 'm1', amount_minor: 900000 }], note: null })
    expect(verifyPerson).toHaveBeenCalledTimes(1)
  })
})

describe('PurchaseFlow', () => {
  async function addShampoo(cost: string) {
    fireEvent.click(button('+ Produto'))
    fireEvent.click(await screen.findByText('Shampoo 5 L'))
    fireEvent.click(button('Mais'))
    fireEvent.change(screen.getByLabelText('Quanto pagou por estas unidades'), { target: { value: cost } })
    fireEvent.click(button('Adicionar à compra'))
    expect(await screen.findByText('Shampoo 5 L adicionado')).toBeTruthy()
    fireEvent.click(button('Terminar'))
  }

  it('blocks Continuar with no products (E2), then sums lines', async () => {
    renderIt(<PurchaseFlow />)
    expect(button('Continuar').disabled).toBe(true)
    await addShampoo('14000')
    expect(screen.getByText('Total 14.000 Kz')).toBeTruthy()
    expect(screen.getByText('2 × garrafão')).toBeTruthy()
    expect(button('Continuar').disabled).toBe(false)
  })

  it('handles contributors: automatic salon remainder, missing amount, zero salon share; retries with the same command and grant', async () => {
    vi.mocked(recordPurchase).mockReset()
      .mockRejectedValueOnce(new AppError('network', 'Failed to fetch'))
      .mockResolvedValueOnce({ purchase_id: 'pu1', occurred_at: new Date().toISOString(), total_minor: 1400000, line_count: 1, new_product_count: 0, salon_amount_minor: 0, contributors: [{ person_id: 'n1', display_name: 'Nádia', amount_minor: 1400000 }], confirmed_by_person_id: 'c1' })
    renderIt(<PurchaseFlow />)
    await addShampoo('14000')
    fireEvent.click(button('Continuar'))
    expect(screen.getByText('o resto, automático')).toBeTruthy()
    fireEvent.click(button('+ Outra pessoa contribuiu'))
    fireEvent.click(await screen.findByRole('button', { name: 'Nádia' }))
    expect(screen.getByTestId('contribution-sentence').textContent).toBe('Indique quanto pagou Nádia ou remova a linha.')
    expect(button('Continuar').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Quanto pagou Nádia'), { target: { value: '14000' } })
    expect(screen.getByText('não contribui')).toBeTruthy()
    expect(screen.getByTestId('contribution-sentence').textContent).toBe('Pronto para confirmar.')
    fireEvent.click(button('Mercado'))
    fireEvent.click(button('Continuar'))
    expect(within(document.querySelector('.kv-card') as HTMLElement).getByText('Nádia 14.000 Kz')).toBeTruthy()
    await confirmWith()
    fireEvent.click(button('Confirmar compra'))
    await screen.findByText('Não foi possível guardar. Os dados continuam aqui.')
    fireEvent.click(button('Tentar novamente'))
    await screen.findByText('Compra registada com sucesso.')
    expect(screen.getByRole('button', { name: 'Corrigir este registo' })).toBeTruthy()
    expect(screen.getByText('Stock actualizado: 1 produto')).toBeTruthy()
    expect(screen.getByText(/pago por Nádia/)).toBeTruthy()
    const calls = vi.mocked(recordPurchase).mock.calls
    expect(calls[0]![0]).toBe(calls[1]![0])
    expect([calls[0]![1], calls[1]![1]]).toEqual(['g1', 'g1'])
    expect(calls[0]![2]).toEqual({
      lines: [{ product_id: 'p1', quantity: 2, line_cost_minor: 1400000 }],
      salonAmountMinor: 0, contributions: [{ person_id: 'n1', amount_minor: 1400000 }], originId: 'o1',
    })
  })
})

describe('period locks (Slice 06 decisions)', () => {
  it('an expense in an approved period is refused with the reason, not a generic error', async () => {
    vi.mocked(recordExpense).mockReset().mockRejectedValue(new AppError('domain', 'PERIOD_APPROVED', 'PERIOD_APPROVED'))
    renderIt(<ExpenseFlow />)
    fireEvent.click(await screen.findByText('Electricidade'))
    fireEvent.change(screen.getByLabelText('Valor pago'), { target: { value: '9000' } })
    fireEvent.click(button('Continuar'))
    await confirmWith()
    fireEvent.click(button('Confirmar despesa'))
    expect(await screen.findByText(/Este período já tem os valores aprovados: não entram novos registos/)).toBeTruthy()
  })
})
