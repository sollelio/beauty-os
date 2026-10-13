// Production blocker (Salão Agradável): the capture flows assumed the codes numerario/transferencia, so with the salon's
// own methods (dinheiro, multicaixa_express) no payment could be built and Confirmar stayed disabled. The methods are
// tenant data: these tests use the salon's real codes and labels and never the old ones.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderScreen } from '../../test/router'
import { effectiveChoice, mixedPair, MIXED, paymentParts } from '../payment'

const AGRADAVEL = [
  { id: 'm-din', code: 'dinheiro', label: 'Dinheiro' },
  { id: 'm-mx', code: 'multicaixa_express', label: 'Multicaixa Express' },
]

vi.mock('../../modules/services/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/services/api')>()),
  listCapturePeople: vi.fn().mockResolvedValue([{ id: 'p1', display_name: 'Patrícia', capabilities: ['Unhas'] }]),
  listFrequentServices: vi.fn().mockResolvedValue([]),
  listPaymentMethods: vi.fn().mockImplementation(async () => AGRADAVEL),
  recordService: vi.fn().mockResolvedValue({ record_id: 'r1', occurred_at: new Date().toISOString() }),
}))
vi.mock('../../modules/catalogue/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/catalogue/api')>()),
  listServices: vi.fn().mockResolvedValue([{ id: 's1', name: 'Desfliso', default_price_minor: 600000 }]),
}))
vi.mock('../../modules/org/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/org/api')>()),
  listConfirmers: vi.fn().mockResolvedValue([{ id: 'c1', display_name: 'Fernando' }]),
  verifyPerson: vi.fn().mockResolvedValue('g1'),
}))
vi.mock('../../modules/money/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/money/api')>()),
  listExpenseCategories: vi.fn().mockResolvedValue([{ id: 'cat1', label: 'Luz', hint: null }]),
  recordExpense: vi.fn().mockResolvedValue({ expense_id: 'e1', occurred_at: new Date().toISOString(), confirmed_by_person_id: 'c1' }),
}))
vi.mock('../../modules/team/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/team/api')>()),
  recordAdvance: vi.fn().mockResolvedValue({ advance_id: 'a1', occurred_at: new Date().toISOString(), confirmed_by_person_id: 'c1' }),
}))
import { recordService } from '../../modules/services/api'
import { recordExpense } from '../../modules/money/api'
import { recordAdvance } from '../../modules/team/api'
import { RecordServiceFlow } from '../../spaces/servicos/RecordServiceFlow'
import { ExpenseFlow } from '../../spaces/dinheiro/ExpenseFlow'
import { AdvanceFlow } from '../../spaces/equipa/AdvanceFlow'

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const lastCall = <T,>(fn: T) => (vi.mocked(fn as never) as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)!
async function confirmWithPin() {
  fireEvent.click(await screen.findByRole('button', { name: 'Fernando' }))
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '246810' } })
}

describe('Registar serviço with the organization’s own payment methods (dinheiro · multicaixa_express)', () => {
  async function toPayment() {
    renderScreen('/servicos/registar', <RecordServiceFlow />)
    fireEvent.click(await screen.findByText('Patrícia'))
    fireEvent.click(await screen.findByText('Desfliso'))
    await screen.findByRole('button', { name: 'Confirmar serviço' })
  }

  it('offers the salon’s labels (Dinheiro · Multicaixa Express · Misto), never the old hardcoded ones', async () => {
    await toPayment()
    const group = screen.getByRole('group', { name: 'Forma de pagamento' })
    expect([...group.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Dinheiro', 'Multicaixa Express', 'Misto'])
    expect(screen.queryByText('Numerário')).toBeNull()
    expect(screen.queryByText('Transferência')).toBeNull()
  })

  it('single payment with Dinheiro (preselected) enables Confirmar and sends the Dinheiro method id', async () => {
    await toPayment()
    expect(button('Dinheiro').getAttribute('aria-pressed')).toBe('true')
    expect(button('Confirmar serviço').disabled).toBe(false)
    fireEvent.click(button('Confirmar serviço'))
    await screen.findByText('Serviço registado com sucesso.')
    expect(screen.getByText('Desfliso · Patrícia · Dinheiro')).toBeTruthy()
    expect(lastCall(recordService)[1]).toEqual({ personId: 'p1', serviceId: 's1', valueMinor: 600000, payments: [{ method_id: 'm-din', amount_minor: 600000 }] })
  })

  it('single payment with Multicaixa Express enables Confirmar and sends that method id', async () => {
    await toPayment()
    fireEvent.click(button('Multicaixa Express'))
    expect(button('Confirmar serviço').disabled).toBe(false)
    fireEvent.click(button('Confirmar serviço'))
    await screen.findByText('Serviço registado com sucesso.')
    expect(lastCall(recordService)[1]).toMatchObject({ payments: [{ method_id: 'm-mx', amount_minor: 600000 }] })
  })

  it('Misto splits between Dinheiro and Multicaixa Express; valid only when the parts add up', async () => {
    await toPayment()
    fireEvent.click(button('Misto'))
    expect(button('Confirmar serviço').disabled).toBe(true)
    expect(screen.getAllByText('Dinheiro').length).toBeGreaterThan(1)                    // field labels are the methods
    fireEvent.change(screen.getByLabelText('Dinheiro'), { target: { value: '4000' } })
    fireEvent.change(screen.getByLabelText('Multicaixa Express'), { target: { value: '1000' } })
    expect(screen.getByTestId('mixed-sentence').textContent).toBe('Soma 5.000 Kz. Faltam 1.000 Kz para chegar aos 6.000 Kz.')
    expect(button('Confirmar serviço').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Multicaixa Express'), { target: { value: '2000' } })
    expect(button('Confirmar serviço').disabled).toBe(false)
    fireEvent.click(button('Confirmar serviço'))
    await screen.findByText('Serviço registado com sucesso.')
    expect(lastCall(recordService)[1]).toMatchObject({
      valueMinor: 600000, payments: [{ method_id: 'm-din', amount_minor: 400000 }, { method_id: 'm-mx', amount_minor: 200000 }],
    })
  })
})

describe('the same assumption in Despesa and Adiantamento', () => {
  it('Despesa: Multicaixa Express single and Misto both build a payment with the salon’s method ids', async () => {
    renderScreen('/dinheiro/despesa', <ExpenseFlow />)
    fireEvent.click(await screen.findByText('Luz'))
    fireEvent.change(screen.getByLabelText('Valor pago'), { target: { value: '9000' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Multicaixa Express' }))
    expect(button('Continuar').disabled).toBe(false)
    fireEvent.click(button('Misto'))
    fireEvent.change(screen.getByLabelText('Dinheiro'), { target: { value: '5000' } })
    fireEvent.change(screen.getByLabelText('Multicaixa Express'), { target: { value: '4000' } })
    expect(button('Continuar').disabled).toBe(false)
    fireEvent.click(button('Continuar'))
    await confirmWithPin()
    fireEvent.click(button('Confirmar despesa'))
    await screen.findByText('Despesa registada com sucesso.')
    expect(lastCall(recordExpense)[2]).toEqual({ categoryId: 'cat1', amountMinor: 900000, note: null,
      payments: [{ method_id: 'm-din', amount_minor: 500000 }, { method_id: 'm-mx', amount_minor: 400000 }] })
  })

  it('Adiantamento: the salon’s methods (no Misto); Multicaixa Express is sent by id', async () => {
    renderScreen('/equipa/adiantamento', <AdvanceFlow />)
    fireEvent.click(await screen.findByText('Patrícia'))
    fireEvent.change(screen.getByLabelText('Valor entregue'), { target: { value: '5000' } })
    const group = await screen.findByRole('group', { name: 'Forma de entrega' })
    await screen.findByRole('button', { name: 'Multicaixa Express' })
    expect([...group.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Dinheiro', 'Multicaixa Express'])
    fireEvent.click(button('Multicaixa Express'))
    expect(button('Continuar').disabled).toBe(false)
    fireEvent.click(button('Continuar'))
    await confirmWithPin()
    fireEvent.click(button('Confirmar adiantamento'))
    await screen.findByText('Adiantamento registado com sucesso.')
    expect(lastCall(recordAdvance)[2]).toEqual({ personId: 'p1', amountMinor: 500000, paymentMethodId: 'm-mx', note: null })
  })
})

describe('payment helpers (no code is assumed)', () => {
  const three = [...AGRADAVEL, { id: 'm-tpa', code: 'tpa', label: 'TPA' }]
  it('Misto exists only with exactly two active methods', () => {
    expect(mixedPair(AGRADAVEL)?.map((m) => m.id)).toEqual(['m-din', 'm-mx'])
    expect(mixedPair([AGRADAVEL[0]!])).toBeNull()
    expect(mixedPair(three)).toBeNull()
    expect(paymentParts(MIXED, three, 100, [50, 50])).toBeNull()
  })
  it('the choice falls back to the first method; an unknown id builds no payment', () => {
    expect(effectiveChoice(null, AGRADAVEL)).toBe('m-din')
    expect(effectiveChoice('gone', AGRADAVEL)).toBe('m-din')
    expect(effectiveChoice(MIXED, [AGRADAVEL[0]!])).toBe('m-din')
    expect(effectiveChoice(null, [])).toBeNull()
    expect(paymentParts('gone', AGRADAVEL, 100, [null, null])).toBeNull()
    expect(paymentParts('m-mx', AGRADAVEL, 100, [null, null])).toEqual([{ method_id: 'm-mx', amount_minor: 100 }])
  })
})
