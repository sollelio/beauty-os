import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { AppError } from '../../shared/errors'
import { fromHoje, renderScreen } from '../../test/router'

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

const EXPENSE = '/dinheiro/despesa', PURCHASE = '/dinheiro/compra'
const renderExpense = (opts?: Parameters<typeof renderScreen>[2]) => renderScreen(EXPENSE, <ExpenseFlow />, opts)
const renderPurchase = (opts?: Parameters<typeof renderScreen>[2]) => renderScreen(PURCHASE, <PurchaseFlow />, opts)
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
async function confirmWith() {
  fireEvent.click(await screen.findByRole('button', { name: 'Duarte' }))
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '135790' } })
}

beforeEach(() => { vi.mocked(verifyPerson).mockClear() })

describe('ExpenseFlow', () => {
  it('blocks Continuar without a value (E1) and while Misto does not add up (E6)', async () => {
    renderExpense()
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
    renderExpense()
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
    renderPurchase()
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
    renderPurchase()
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
    expect(screen.getByText('Registada no histórico de 1 produto')).toBeTruthy()
    expect(screen.queryByText(/Stock actualizado/)).toBeNull()
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

describe('ExpenseFlow back/history contract', () => {
  it('Android back with a typed amount asks before leaving; Continuar a editar keeps the amount', async () => {
    const { router } = renderExpense(fromHoje(EXPENSE))
    fireEvent.click(await screen.findByText('Electricidade'))
    fireEvent.change(screen.getByLabelText('Valor pago'), { target: { value: '9000' } })
    await act(() => router.navigate(-1))                                     // step 2 → 1: no question, data kept
    expect(await screen.findByText('Que despesa?')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    await act(() => router.navigate(-1))                                     // out of the flow
    expect(await screen.findByRole('dialog', { name: 'Descartar esta despesa?' })).toBeTruthy()
    fireEvent.click(button('Continuar a editar'))
    await act(() => router.navigate(1))
    expect((await screen.findByLabelText('Valor pago') as HTMLInputElement).value).toBe('9.000')
  })

  it('opened by a deep link: × with no data falls back to Hoje by replacement', async () => {
    const { router } = renderExpense()
    await screen.findByText('Electricidade')
    fireEvent.click(button('Fechar'))
    expect(await screen.findByText('Ecrã Hoje')).toBeTruthy()
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('after saving, back does not reopen the submitted form', async () => {
    vi.mocked(recordExpense).mockReset().mockResolvedValueOnce({ expense_id: 'e1', occurred_at: new Date().toISOString(), confirmed_by_person_id: 'c1' })
    const { router } = renderExpense(fromHoje(EXPENSE))
    fireEvent.click(await screen.findByText('Electricidade'))
    fireEvent.change(screen.getByLabelText('Valor pago'), { target: { value: '9000' } })
    fireEvent.click(button('Continuar'))
    await confirmWith()
    fireEvent.click(button('Confirmar despesa'))
    await screen.findByText('Despesa registada com sucesso.')
    await waitFor(() => expect(router.state.location.search).toBe(''))
    fireEvent.click(button('Voltar a Hoje'))                                 // pops back to the Hoje entry
    expect(await screen.findByText('Ecrã Hoje')).toBeTruthy()
    expect(router.state.historyAction).toBe('POP')
    await act(() => router.navigate(1))                                      // even forward lands on a fresh flow
    expect(await screen.findByText('Que despesa?')).toBeTruthy()
    expect(screen.queryByText('Confirmação necessária')).toBeNull()
  })
})

describe('PurchaseFlow back/history contract', () => {
  async function addLine(cost: string) {
    fireEvent.click(button('+ Produto'))
    fireEvent.click(await screen.findByText('Shampoo 5 L'))
    fireEvent.change(screen.getByLabelText('Quanto pagou por estas unidades'), { target: { value: cost } })
    fireEvent.click(button('Adicionar à compra'))
    fireEvent.click(await screen.findByRole('button', { name: 'Terminar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }

  it('Android back closes the open sheet first and stays on the purchase', async () => {
    const { router } = renderPurchase(fromHoje(PURCHASE))
    fireEvent.click(await screen.findByRole('button', { name: '+ Produto' }))
    const sheet = await screen.findByRole('dialog', { name: 'Adicionar produto' })
    expect(sheet.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(screen.getByLabelText('Procurar ou escrever produto'))
    await act(() => router.navigate(-1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe(PURCHASE)
    expect(screen.getByText('O que comprou?')).toBeTruthy()
  })

  // Line sheet (J4): a half-typed line is a draft — back never drops it silently, and never leaves Compra.
  async function openShampooLine() {
    fireEvent.click(await screen.findByRole('button', { name: '+ Produto' }))
    fireEvent.click(await screen.findByText('Shampoo 5 L'))
    return screen.findByRole('dialog', { name: 'Shampoo 5 L' })
  }
  const cost = () => (screen.getByLabelText('Quanto pagou por estas unidades') as HTMLInputElement).value

  it('line sheet, nothing typed: back closes it normally and stays on Compra', async () => {
    const { router } = renderPurchase(fromHoje(PURCHASE))
    await openShampooLine()
    await act(() => router.navigate(-1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe(PURCHASE)
    expect(screen.getByText('O que comprou?')).toBeTruthy()
  })

  it('line sheet with a typed draft: back asks; Continuar a editar keeps the draft; backdrop and Escape do nothing', async () => {
    const { router } = renderPurchase(fromHoje(PURCHASE))
    await openShampooLine()
    fireEvent.click(button('Mais'))
    fireEvent.change(screen.getByLabelText('Quanto pagou por estas unidades'), { target: { value: '7000' } })
    fireEvent.click(document.querySelector('.sheet') as HTMLElement)               // backdrop: not dismissed
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Shampoo 5 L' }), { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Shampoo 5 L' })).toBeTruthy()
    await act(() => router.navigate(-1))                                            // Android back
    const ask = await screen.findByRole('dialog', { name: 'Descartar este produto?' })
    expect(within(ask).getByText('Não é adicionado à compra.')).toBeTruthy()
    expect(document.activeElement?.textContent).toBe('Continuar a editar')
    expect(router.state.location.pathname).toBe(PURCHASE)
    expect(screen.queryByRole('dialog', { name: 'Descartar esta compra?' })).toBeNull()
    fireEvent.click(button('Continuar a editar'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descartar este produto?' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Shampoo 5 L' })).toBeTruthy()       // the line sheet is still the active layer
    expect(cost()).toBe('7.000')
    expect(screen.getByText('2 garrafão')).toBeTruthy()
    fireEvent.click(button('Adicionar à compra'))                                   // saving is not a discard: no question
    fireEvent.click(await screen.findByRole('button', { name: 'Terminar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Total 7.000 Kz')).toBeTruthy()
  })

  it('Descartar drops only that unsaved line: the sheet closes, already-added lines and the flow stay', async () => {
    const { router } = renderPurchase(fromHoje(PURCHASE))
    await addLine('7000')                                                           // one line already in the purchase
    fireEvent.click(screen.getByText('Shampoo 5 L'))                                // edit it…
    fireEvent.change(await screen.findByLabelText('Quanto pagou por estas unidades'), { target: { value: '9900' } })
    await act(() => router.navigate(-1))
    expect(await screen.findByRole('dialog', { name: 'Descartar as alterações?' })).toBeTruthy()
    fireEvent.click(button('Descartar'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe(PURCHASE)                           // still in Compra, step 1
    expect(screen.getByText('O que comprou?')).toBeTruthy()
    expect(screen.getByText('Total 7.000 Kz')).toBeTruthy()                          // the line as it was, not 9.900
  })

  it('the line sheet ← with a typed draft asks the same question; Descartar returns to the search', async () => {
    renderPurchase(fromHoje(PURCHASE))
    await openShampooLine()
    fireEvent.change(screen.getByLabelText('Quanto pagou por estas unidades'), { target: { value: '7000' } })
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Shampoo 5 L' })).getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByRole('dialog', { name: 'Descartar este produto?' })).toBeTruthy()
    fireEvent.click(button('Continuar a editar'))
    expect(cost()).toBe('7.000')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Shampoo 5 L' })).getByRole('button', { name: 'Voltar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    expect(await screen.findByRole('dialog', { name: 'Adicionar produto' })).toBeTruthy()
    expect(screen.getByText('Ainda não há produtos nesta compra.')).toBeTruthy()
  })

  it('lines survive step-back; leaving with lines asks first (Descartar is the destructive choice)', async () => {
    const { router } = renderPurchase(fromHoje(PURCHASE))
    await addLine('7000')
    fireEvent.click(button('Continuar'))
    expect(await screen.findByText('Quem pagou?')).toBeTruthy()
    await act(() => router.navigate(-1))
    expect(await screen.findByText('O que comprou?')).toBeTruthy()
    expect(screen.getByText('Total 7.000 Kz')).toBeTruthy()
    fireEvent.click(button('Fechar'))
    expect(await screen.findByRole('dialog', { name: 'Descartar esta compra?' })).toBeTruthy()
    expect(button('Descartar').className).toContain('btn-destructive')
    fireEvent.click(button('Continuar a editar'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Total 7.000 Kz')).toBeTruthy()
    await act(() => router.navigate(-1))
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    expect(await screen.findByText('Ecrã Hoje')).toBeTruthy()
  })

  it('after saving, the step entries are gone: back from success goes to Hoje', async () => {
    vi.mocked(recordPurchase).mockReset().mockResolvedValueOnce({ purchase_id: 'pu1', occurred_at: new Date().toISOString(), total_minor: 700000, line_count: 1, new_product_count: 0, salon_amount_minor: 700000, contributors: [], confirmed_by_person_id: 'c1' })
    const { router } = renderPurchase(fromHoje(PURCHASE))
    await addLine('7000')
    fireEvent.click(button('Continuar'))
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }))
    await confirmWith()
    fireEvent.click(button('Confirmar compra'))
    await screen.findByText('Compra registada com sucesso.')
    expect(screen.queryByText(/Stock actualizado/)).toBeNull()
    await waitFor(() => expect(router.state.location.search).toBe(''))
    await act(() => router.navigate(-1))
    expect(await screen.findByText('Ecrã Hoje')).toBeTruthy()
  })
})

describe('period locks (Slice 06 decisions)', () => {
  it('an expense in an approved period is refused with the reason, not a generic error', async () => {
    vi.mocked(recordExpense).mockReset().mockRejectedValue(new AppError('domain', 'PERIOD_APPROVED', 'PERIOD_APPROVED'))
    renderExpense()
    fireEvent.click(await screen.findByText('Electricidade'))
    fireEvent.change(screen.getByLabelText('Valor pago'), { target: { value: '9000' } })
    fireEvent.click(button('Continuar'))
    await confirmWith()
    fireEvent.click(button('Confirmar despesa'))
    expect(await screen.findByText(/Este período já tem os valores aprovados: não entram novos registos/)).toBeTruthy()
  })
})
