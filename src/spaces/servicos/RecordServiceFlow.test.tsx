import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { fromHoje, renderScreen } from '../../test/router'

vi.mock('../../modules/services/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/services/api')>()),
  listCapturePeople: vi.fn().mockResolvedValue([{ id: 'p1', display_name: 'Ana', capabilities: ['Cabelo'] }]),
  listFrequentServices: vi.fn().mockResolvedValue([]),
  listPaymentMethods: vi.fn().mockResolvedValue([{ id: 'm1', code: 'numerario', label: 'Numerário' }, { id: 'm2', code: 'transferencia', label: 'Transferência' }]),
  recordService: vi.fn(),
}))
vi.mock('../../modules/catalogue/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/catalogue/api')>()),
  listServices: vi.fn().mockResolvedValue([{ id: 's1', name: 'Coloração', default_price_minor: 1200000 }, { id: 's2', name: 'Corte', default_price_minor: 500000 }]),
}))
import { recordService } from '../../modules/services/api'
import { RecordServiceFlow } from './RecordServiceFlow'

const PATH = '/servicos/registar'
const renderFlow = (opts?: Parameters<typeof renderScreen>[2]) => renderScreen(PATH, <RecordServiceFlow />, opts)
async function toStep3() {
  fireEvent.click(await screen.findByText('Ana'))
  fireEvent.click(await screen.findByText('Coloração'))
  await screen.findByRole('button', { name: 'Confirmar serviço' })
}

describe('RecordServiceFlow validation', () => {
  it('keeps Confirmar disabled until mixed parts add up to the value', async () => {
    renderFlow()
    await toStep3()
    const confirm = screen.getByRole('button', { name: 'Confirmar serviço' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Misto' }))
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Numerário'), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText('Transferência'), { target: { value: '1000' } })
    expect(screen.getByTestId('mixed-sentence').textContent).toBe('Soma 11.000 Kz. Faltam 1.000 Kz para chegar aos 12.000 Kz.')
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Transferência'), { target: { value: '2000' } })
    expect(confirm.disabled).toBe(false)
  })
})

describe('RecordServiceFlow back/history contract', () => {
  it('each step is a history entry: Android back goes 3 → 2 → 1 and forward returns with the typed value intact', async () => {
    const { router } = renderFlow(fromHoje(PATH))
    await toStep3()
    expect(router.state.location.search).toBe('?passo=3')
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '15000' } })
    await act(() => router.navigate(-1))
    expect(await screen.findByText('Que serviço?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mudar profissional: Ana' })).toBeTruthy()      // the person is kept
    await act(() => router.navigate(-1))
    expect(await screen.findByText('Quem fez o serviço?')).toBeTruthy()
    expect(router.state.location.pathname).toBe(PATH)
    await act(() => router.navigate(2))                                                       // forward, twice
    expect((await screen.findByLabelText('Valor') as HTMLInputElement).value).toBe('15000')
  })

  it('the app-bar ← steps back through history, not to a fixed path', async () => {
    const { router } = renderFlow(fromHoje(PATH))
    await toStep3()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByText('Que serviço?')).toBeTruthy()
    expect(router.state.historyAction).toBe('POP')
    expect(router.state.location.search).toBe('?passo=2')
  })

  it('a typed value is not lost by Android back: "Descartar?" holds the navigation until a choice is made', async () => {
    const { router } = renderFlow(fromHoje(PATH))
    await toStep3()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '15000' } })
    await act(() => router.navigate(-2))                                                      // back to step 1 …
    await act(() => router.navigate(-1))                                                      // … and out of the flow
    expect(await screen.findByRole('dialog', { name: 'Descartar este serviço?' })).toBeTruthy()
    expect(router.state.location.pathname).toBe(PATH)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a editar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe(PATH)
    await act(() => router.navigate(-1))
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    expect(await screen.findByText('Ecrã Hoje')).toBeTruthy()
  })

  it('after saving, back never reopens the submitted form; "Voltar a Hoje" returns to the Hoje entry', async () => {
    vi.mocked(recordService).mockResolvedValueOnce({ record_id: 'r1', occurred_at: new Date().toISOString() })
    const { router } = renderFlow(fromHoje(PATH))
    await toStep3()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar serviço' }))
    expect(await screen.findByText('Serviço registado com sucesso.')).toBeTruthy()
    await waitFor(() => expect(router.state.location.search).toBe(''))                       // step entries unwound
    expect(screen.getByText('Serviço registado com sucesso.')).toBeTruthy()
    await act(() => router.navigate(-1))                                                      // Android back from success
    expect(await screen.findByText('Ecrã Hoje')).toBeTruthy()
    expect(screen.queryByText('Valor e pagamento')).toBeNull()
  })

  it('a deep-linked step without its data starts the flow; × then falls back to Hoje without a broken history', async () => {
    const { router } = renderFlow({ entries: [`${PATH}?passo=3`] })
    expect(await screen.findByText('Quem fez o serviço?')).toBeTruthy()
    await waitFor(() => expect(router.state.location.search).toBe(''))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(await screen.findByText('Ecrã Hoje')).toBeTruthy()
    expect(router.state.historyAction).toBe('REPLACE')
  })

  // Production bug (Android): back to "Que serviço?" and the same service again reset the edited value to the default.
  describe('an edited value survives stepping back to the service list', () => {
    async function editValue(digits: string) {
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
      fireEvent.change(screen.getByLabelText('Valor'), { target: { value: digits } })
    }
    const valueField = () => screen.getByLabelText('Valor') as HTMLInputElement

    it('same service again: the edited value is still there; the step-back asked nothing; the service is marked', async () => {
      const { router } = renderFlow(fromHoje(PATH))
      await toStep3()
      await editValue('15000')
      await act(() => router.navigate(-1))                                      // Android back to the service list
      expect(await screen.findByText('Que serviço?')).toBeTruthy()
      expect(screen.queryByRole('dialog')).toBeNull()                           // internal step-back: no "Descartar?"
      const row = screen.getByRole('button', { name: /Coloração/ })
      expect(row.getAttribute('aria-current')).toBe('true')                    // the chosen service is identifiable
      expect(screen.getByRole('button', { name: /Corte/ }).getAttribute('aria-current')).toBeNull()
      fireEvent.click(row)                                                      // the same service again
      expect(await screen.findByLabelText('Valor')).toBeTruthy()
      expect(valueField().value).toBe('15000')
      expect(screen.getByText('Coloração · Ana · 15.000 Kz')).toBeTruthy()
    })

    it('the service list shows the edited value on the chosen row, with the habitual price as context', async () => {
      const { router } = renderFlow(fromHoje(PATH))
      await toStep3()
      await editValue('154656')
      await act(() => router.navigate(-1))
      const row = await screen.findByRole('button', { name: /Coloração/ })
      expect(row.getAttribute('aria-current')).toBe('true')
      expect(within(row).getByText('154.656 Kz')).toBeTruthy()                  // the draft, prominent
      expect(within(row).getByText(/Habitual: 12\.000 Kz/)).toBeTruthy()        // the catalogue price, as context
      const other = screen.getByRole('button', { name: /Corte/ })               // other rows stay as they were
      expect(other.textContent).toBe('Corte5.000 Kz')
      fireEvent.click(row)                                                      // same service: the draft comes back
      expect(valueField().value).toBe('154656')
    })

    it('a chosen service still at its habitual price keeps the normal row, only highlighted', async () => {
      const { router } = renderFlow(fromHoje(PATH))
      await toStep3()
      await act(() => router.navigate(-1))
      const row = await screen.findByRole('button', { name: /Coloração/ })
      expect(row.getAttribute('aria-current')).toBe('true')
      expect(row.textContent).toBe('Coloração12.000 Kz')
      expect(within(row).queryByText(/Habitual/)).toBeNull()
    })

    it('an edit typed back to the habitual price is shown as the normal row', async () => {
      const { router } = renderFlow(fromHoje(PATH))
      await toStep3()
      await editValue('12000')
      await act(() => router.navigate(-1))
      expect((await screen.findByRole('button', { name: /Coloração/ })).textContent).toBe('Coloração12.000 Kz')
    })

    it('after choosing a different service, its row shows its own price (no stale draft)', async () => {
      const { router } = renderFlow(fromHoje(PATH))
      await toStep3()
      await editValue('154656')
      await act(() => router.navigate(-1))
      fireEvent.click(await screen.findByRole('button', { name: /Corte/ }))
      expect(await screen.findByText('5.000 Kz')).toBeTruthy()                  // Corte's own default on the value step
      await act(() => router.navigate(-1))
      const corte = await screen.findByRole('button', { name: /Corte/ })
      expect(corte.getAttribute('aria-current')).toBe('true')
      expect(corte.textContent).toBe('Corte5.000 Kz')
      expect(screen.getByRole('button', { name: /Coloração/ }).textContent).toBe('Coloração12.000 Kz')
    })

    it('the same person and service again (back twice) keep it too', async () => {
      const { router } = renderFlow(fromHoje(PATH))
      await toStep3()
      await editValue('15000')
      await act(() => router.navigate(-2))
      expect(await screen.findByText('Quem fez o serviço?')).toBeTruthy()
      expect(screen.queryByRole('dialog')).toBeNull()
      fireEvent.click(screen.getByText('Ana'))
      fireEvent.click(await screen.findByRole('button', { name: /Coloração/ }))
      expect(valueField().value).toBe('15000')
    })

    it('a different service starts from its own catalogue price', async () => {
      const { router } = renderFlow(fromHoje(PATH))
      await toStep3()
      await editValue('15000')
      await act(() => router.navigate(-1))
      fireEvent.click(await screen.findByRole('button', { name: /Corte/ }))
      expect(await screen.findByText('5.000 Kz')).toBeTruthy()                  // Corte's default, shown, not edited
      expect(screen.queryByLabelText('Valor')).toBeNull()
      expect(screen.getByText('Corte · Ana · 5.000 Kz')).toBeTruthy()
    })

    it('leaving the flow with the edited value still asks "Descartar?"', async () => {
      const { router } = renderFlow(fromHoje(PATH))
      await toStep3()
      await editValue('15000')
      await act(() => router.navigate(-1))
      fireEvent.click(await screen.findByRole('button', { name: /Coloração/ }))
      await screen.findByLabelText('Valor')
      fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))           // app-bar ← to step 2 …
      fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))    // … and to step 1
      fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }))    // × leaves the flow
      expect(await screen.findByRole('dialog', { name: 'Descartar este serviço?' })).toBeTruthy()
      expect(router.state.location.pathname).toBe(PATH)
    })
  })
})
