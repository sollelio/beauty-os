import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
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
  listServices: vi.fn().mockResolvedValue([{ id: 's1', name: 'Coloração', default_price_minor: 1200000 }]),
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
})
