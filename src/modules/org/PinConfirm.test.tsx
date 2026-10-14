// PinConfirm + ConfirmDialog (UX slice 2): one person/PIN pattern for private entry and every Confirmação necessária,
// and one confirmation sheet for destructive choices. The server still verifies (ADR-0009); these test the entry.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { AppError } from '../../shared/errors'
import { renderScreen } from '../../test/router'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useSheet } from '../../shared/ui/navigation'
import type { StockProduct } from '../stock/api'

vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  listConfirmers: vi.fn().mockResolvedValue([{ id: 'c1', display_name: 'Fernando' }]),
  verifyPerson: vi.fn(),
}))
vi.mock('./privateContext', async (orig) => ({
  ...(await orig<typeof import('./privateContext')>()),
  listPrivatePeople: vi.fn().mockResolvedValue([{ id: 'p1', display_name: 'Fernando' }]),
  enterPrivateContext: vi.fn(),
  getPrivateStatus: vi.fn().mockResolvedValue({ active: true, person_id: 'p1', display_name: 'Fernando', view: 'manager', business_health: true, expires_at: '2099-01-01T00:00:00Z' }),
}))
vi.mock('../services/api', async (orig) => ({
  ...(await orig<typeof import('../services/api')>()),
  listCapturePeople: vi.fn().mockResolvedValue([{ id: 'n1', display_name: 'Patrícia', capabilities: ['Unhas'] }]),
  listPaymentMethods: vi.fn().mockResolvedValue([{ id: 'm1', code: 'dinheiro', label: 'Dinheiro' }]),
}))
vi.mock('../team/api', async (orig) => ({ ...(await orig<typeof import('../team/api')>()), recordAdvance: vi.fn() }))
vi.mock('../stock/api', async (orig) => ({ ...(await orig<typeof import('../stock/api')>()), getStockOverview: vi.fn() }))
import { listConfirmers, verifyPerson } from './api'
import { enterPrivateContext } from './privateContext'
import { recordAdvance } from '../team/api'
import { getStockOverview } from '../stock/api'
import { ConfirmerPicker } from './ConfirmerPicker'
import { AdvanceFlow } from '../../spaces/equipa/AdvanceFlow'
import { PrivateEntryPage } from '../../spaces/privado/PrivateEntryPage'
import { MarketPage } from '../../spaces/stock/MarketPage'

function Picker() {
  const [id, setId] = useState<string | null>(null)
  const [secret, setSecret] = useState('')
  return <ConfirmerPicker permission="period.decide" confirmerId={id} onConfirmer={setId} secret={secret} onSecret={setSecret} />
}
const person = (name: string) => screen.getByRole('button', { name })
const pin = () => screen.getByLabelText('PIN') as HTMLInputElement

beforeEach(() => { vi.mocked(verifyPerson).mockReset(); vi.mocked(recordAdvance).mockReset(); vi.mocked(enterPrivateContext).mockReset(); localStorage.clear() })

describe('PinConfirm', () => {
  it('one eligible confirmer is chosen automatically and the PIN gets focus', async () => {
    renderScreen('/x', <Picker />)
    await waitFor(() => expect(person('Fernando').getAttribute('aria-pressed')).toBe('true'))
    await waitFor(() => expect(document.activeElement).toBe(pin()))                  // focus follows in an effect after the selection renders
  })

  it('with several confirmers nobody is preselected; tapping one selects it (and only it)', async () => {
    vi.mocked(listConfirmers).mockResolvedValueOnce([{ id: 'c1', display_name: 'Fernando' }, { id: 'c2', display_name: 'Merce' }])
    renderScreen('/x', <Picker />)
    await screen.findByRole('button', { name: 'Merce' })
    expect([person('Fernando'), person('Merce')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false'])
    fireEvent.click(person('Merce'))
    expect([person('Fernando'), person('Merce')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    expect(document.activeElement).toBe(pin())
  })

  it('the PIN is a six-digit numeric entry that never shows the digits', async () => {
    renderScreen('/x', <Picker />)
    const input = await screen.findByLabelText('PIN') as HTMLInputElement
    expect([input.type, input.inputMode, input.maxLength, input.autocomplete]).toEqual(['password', 'numeric', 6, 'off'])
    fireEvent.change(input, { target: { value: '12a34567890' } })
    expect(input.value).toBe('123456')                                     // digits only, six at most
    expect(document.querySelectorAll('.pin-cell.filled')).toHaveLength(6)
    expect(document.querySelector('.pin-cells')?.textContent).toBe('')    // progress only, no digits on screen
  })
})

describe('PIN failure in a real command (Adiantamento)', () => {
  it('a wrong PIN clears the PIN and says so once, under it; the retry keeps the command and uses the new grant', async () => {
    vi.mocked(verifyPerson).mockRejectedValueOnce(new AppError('domain', 'INVALID', 'INVALID')).mockResolvedValueOnce('g2')
    vi.mocked(recordAdvance).mockResolvedValue({ advance_id: 'a1', occurred_at: new Date().toISOString(), confirmed_by_person_id: 'c1' })
    renderScreen('/equipa/adiantamento', <AdvanceFlow />)
    fireEvent.click(await screen.findByText('Patrícia'))
    fireEvent.change(screen.getByLabelText('Valor entregue'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await waitFor(() => expect(person('Fernando').getAttribute('aria-pressed')).toBe('true'))   // single confirmer
    const feedback = document.querySelector('.pin-feedback')!                // reserved before any failure (CSS min-height) …
    expect(feedback.textContent).toBe('')
    fireEvent.change(pin(), { target: { value: '111111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar adiantamento' }))
    expect(await within(feedback as HTMLElement).findByText('PIN incorreto.')).toBeTruthy()
    expect(screen.getAllByText('PIN incorreto.')).toHaveLength(1)        // not repeated as a page notice
    expect(pin().value).toBe('')
    expect(document.querySelector('.pin-feedback')).toBe(feedback)          // … and the message lands in that same line
    expect(recordAdvance).not.toHaveBeenCalled()
    fireEvent.change(pin(), { target: { value: '246810' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar adiantamento' }))
    await screen.findByText('Adiantamento registado com sucesso.')
    expect(verifyPerson).toHaveBeenNthCalledWith(1, 'c1', '111111')
    expect(verifyPerson).toHaveBeenNthCalledWith(2, 'c1', '246810')
    expect(recordAdvance).toHaveBeenCalledTimes(1)
    expect(vi.mocked(recordAdvance).mock.calls[0]![1]).toBe('g2')         // the grant from the successful verification
  })
})

describe('ConfirmDialog', () => {
  function Screen() {
    const dialog = useSheet<true>()
    const [done, setDone] = useState(false)
    return (
      <main>
        <h1>Ecrã de baixo</h1>{done && <p>Feito</p>}
        <button onClick={() => dialog.open(true)}>Terminar</button>
        {dialog.current && <ConfirmDialog title="Terminar sem compra?" safeLabel="Continuar no mercado" destructiveLabel="Terminar sem compra"
          onSafe={dialog.close} onDestructive={() => { setDone(true); dialog.close() }}>O que marcou perde-se.</ConfirmDialog>}
      </main>
    )
  }
  it('safe action first (primary, focused), destructive last; Escape is the safe action', async () => {
    renderScreen('/x', <Screen />, { entries: ['/', '/x'], index: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Terminar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Terminar sem compra?' })
    const buttons = within(dialog).getAllByRole('button')
    expect(buttons.map((b) => [b.textContent, b.className])).toEqual([['Continuar no mercado', 'btn btn-primary'], ['Terminar sem compra', 'btn btn-destructive']])
    expect(document.activeElement).toBe(buttons[0])
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByText('Feito')).toBeNull()
  })
  it('Android/browser back closes it and returns to the screen underneath, without acting', async () => {
    const { router } = renderScreen('/x', <Screen />, { entries: ['/', '/x'], index: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Terminar' }))
    await screen.findByRole('dialog')
    await act(() => router.navigate(-1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/x')
    expect(screen.getByText('Ecrã de baixo')).toBeTruthy()
    expect(screen.queryByText('Feito')).toBeNull()
  })
  it('Modo mercado: "Terminar sem compra" asks; back keeps the trip; confirming ends it', async () => {
    const product: StockProduct = { id: 's1', name: 'Shampoo', unit_word: 'garrafão', purpose: null, state: 'comprar', level: null, reserve_units: 0,
      marked_at: null, on_list: true, planned_qty: 1, urgent: false, last_purchase: null, bought_today: null }
    vi.mocked(getStockOverview).mockResolvedValue([product])
    const { router } = renderScreen('/stock/mercado', <MarketPage />, { entries: ['/', '/stock/mercado'], index: 1, routes: [{ path: '/stock', element: <p>Stock</p> }] })
    const end = await screen.findByRole('button', { name: 'Terminar sem compra' })
    expect(end.className).toContain('btn-destructive')
    fireEvent.click(end)
    await screen.findByRole('dialog', { name: 'Terminar sem compra?' })
    await act(() => router.navigate(-1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/stock/mercado')
    expect(localStorage.getItem(Object.keys(localStorage)[0]!)).toBeTruthy()           // the trip draft is still there
    fireEvent.click(screen.getByRole('button', { name: 'Terminar sem compra' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Terminar sem compra' }))
    expect(await screen.findByText('Stock')).toBeTruthy()
    expect(localStorage.length).toBe(0)
  })
})

describe('private entry', () => {
  it('uses the same control; one person is preselected; the session is entered exactly as before', async () => {
    vi.mocked(enterPrivateContext).mockResolvedValue(undefined)
    renderScreen('/privado/entrar', <PrivateEntryPage />, { routes: [{ path: '/privado', element: <p>Área privada aberta</p> }] })
    await waitFor(() => expect(person('Fernando').getAttribute('aria-pressed')).toBe('true'))
    await waitFor(() => expect(document.activeElement).toBe(pin()))
    fireEvent.change(pin(), { target: { value: '246810' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Área privada aberta')).toBeTruthy()
    expect(enterPrivateContext).toHaveBeenCalledWith('p1', '246810')
  })
  it('a wrong PIN clears it and is shown under it, not as a page notice', async () => {
    vi.mocked(enterPrivateContext).mockRejectedValueOnce(new AppError('domain', 'INVALID', 'INVALID'))
    renderScreen('/privado/entrar', <PrivateEntryPage />)
    await waitFor(() => expect(person('Fernando').getAttribute('aria-pressed')).toBe('true'))
    fireEvent.change(pin(), { target: { value: '111111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await within(document.querySelector('.pin-feedback') as HTMLElement).findByText('PIN incorreto.')).toBeTruthy()
    expect(screen.getAllByText('PIN incorreto.')).toHaveLength(1)
    expect(pin().value).toBe('')
  })
})

