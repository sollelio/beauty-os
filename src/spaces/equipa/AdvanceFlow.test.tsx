import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppError } from '../../shared/errors'
import { fromHoje, renderScreen } from '../../test/router'

vi.mock('../../modules/services/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/services/api')>()),
  listCapturePeople: vi.fn().mockResolvedValue([{ id: 'p1', display_name: 'Ana', capabilities: ['Cabelo'] }]),
  listPaymentMethods: vi.fn().mockResolvedValue([{ id: 'm1', code: 'numerario', label: 'Numerário' }, { id: 'm2', code: 'transferencia', label: 'Transferência' }]),
}))
vi.mock('../../modules/org/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/org/api')>()),
  listConfirmers: vi.fn().mockResolvedValue([{ id: 'c1', display_name: 'Duarte' }]),
  verifyPerson: vi.fn().mockResolvedValue('g1'),
}))
vi.mock('../../modules/team/api', async (orig) => ({ ...(await orig<typeof import('../../modules/team/api')>()), recordAdvance: vi.fn() }))
import { verifyPerson } from '../../modules/org/api'
import { recordAdvance } from '../../modules/team/api'
import { AdvanceFlow } from './AdvanceFlow'

const PATH = '/equipa/adiantamento'
const renderFlow = (opts?: Parameters<typeof renderScreen>[2]) => renderScreen(PATH, <AdvanceFlow />, opts)

describe('AdvanceFlow', () => {
  it('blocks Continuar until an amount is entered (E1)', async () => {
    renderFlow()
    fireEvent.click(await screen.findByText('Ana'))
    const cont = screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement
    expect(cont.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Valor entregue'), { target: { value: '0' } })
    expect(cont.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Valor entregue'), { target: { value: '10000' } })
    expect(cont.disabled).toBe(false)
    expect((screen.getByLabelText('Valor entregue') as HTMLInputElement).value).toBe('10.000')
  })

  it('keeps the data after a network failure and retries with the same command_id and grant', async () => {
    vi.mocked(recordAdvance)
      .mockRejectedValueOnce(new AppError('network', 'Failed to fetch'))
      .mockResolvedValueOnce({ advance_id: 'a1', occurred_at: new Date().toISOString(), confirmed_by_person_id: 'c1' })
    renderFlow()
    fireEvent.click(await screen.findByText('Ana'))
    fireEvent.change(screen.getByLabelText('Valor entregue'), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText('Nota (opcional)'), { target: { value: 'pedido ontem' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Duarte' }))
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '135790' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar adiantamento' }))
    await screen.findByText('Não foi possível guardar. Os dados continuam aqui.')
    expect(screen.getByText('pedido ontem')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await screen.findByText('Adiantamento registado com sucesso.')
    const calls = vi.mocked(recordAdvance).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0]![0]).toBe(calls[1]![0])                 // same command_id
    expect(calls[0]![1]).toBe('g1')                         // the exact grant from verification…
    expect(calls[1]![1]).toBe('g1')                         // …reused on retry
    expect(calls[0]![2]).toEqual({ personId: 'p1', amountMinor: 1000000, paymentMethodId: 'm1', note: 'pedido ontem' })
    expect(verifyPerson).toHaveBeenCalledTimes(1)
  })

  it('asks before discarding typed data (E4)', async () => {
    renderFlow()
    fireEvent.click(await screen.findByText('Ana'))
    fireEvent.change(screen.getByLabelText('Valor entregue'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.getByText('Descartar este adiantamento?')).toBeTruthy())
    expect(screen.getByText('Nada foi registado.')).toBeTruthy()
  })

  it('Android back keeps the typed data: step 2 → 1 and forward again, nothing lost', async () => {
    const { router } = renderFlow(fromHoje(PATH))
    fireEvent.click(await screen.findByText('Ana'))
    fireEvent.change(screen.getByLabelText('Valor entregue'), { target: { value: '5000' } })
    fireEvent.change(screen.getByLabelText('Nota (opcional)'), { target: { value: 'táxi' } })
    await act(() => router.navigate(-1))
    expect(await screen.findByText('Adiantamento para quem?')).toBeTruthy()
    await act(() => router.navigate(1))
    expect((await screen.findByLabelText('Valor entregue') as HTMLInputElement).value).toBe('5.000')
    expect((screen.getByLabelText('Nota (opcional)') as HTMLInputElement).value).toBe('táxi')
  })

  it('Android back out of the flow with typed data asks first; Continuar a editar stays, Descartar leaves', async () => {
    const { router } = renderFlow(fromHoje(PATH))
    fireEvent.click(await screen.findByText('Ana'))
    fireEvent.change(screen.getByLabelText('Valor entregue'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText('Confirmação necessária')).toBeTruthy()
    await act(() => router.navigate(-3))                                    // straight out of the flow, from step 3
    const sheet = await screen.findByRole('dialog', { name: 'Descartar este adiantamento?' })
    expect(sheet.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement?.textContent).toBe('Continuar a editar')  // the safe action has focus
    expect(router.state.location.pathname).toBe(PATH)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a editar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Confirmação necessária')).toBeTruthy()          // still on step 3, data intact
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }))  // app-bar × on step 1
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    expect(await screen.findByText('Ecrã Hoje')).toBeTruthy()
  })

  it('leaving without typed data does not ask', async () => {
    renderFlow(fromHoje(PATH))
    await screen.findByText('Ana')
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(await screen.findByText('Ecrã Hoje')).toBeTruthy()
  })
})

describe('useRecordAdvance grant handling', () => {
  it('re-verifies the same confirmer when the server refuses the kept grant, never using another grant', async () => {
    const { renderHook, act, waitFor } = await import('@testing-library/react')
    const { useRecordAdvance } = await import('../../modules/team/useRecordAdvance')
    vi.mocked(verifyPerson).mockReset().mockResolvedValueOnce('g-first').mockResolvedValueOnce('g-second')
    vi.mocked(recordAdvance).mockReset()
      .mockRejectedValueOnce(new AppError('network', 'Failed to fetch'))
      .mockRejectedValueOnce(new AppError('domain', 'VERIFICATION_REQUIRED', 'VERIFICATION_REQUIRED'))
      .mockResolvedValueOnce({ advance_id: 'a2', occurred_at: new Date().toISOString(), confirmed_by_person_id: 'c1' })
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const { result } = renderHook(() => useRecordAdvance(), { wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> })
    const args = { input: { personId: 'p1', amountMinor: 1000, paymentMethodId: 'm1', note: null }, confirmerId: 'c1', secret: '1' }
    act(() => result.current.confirm(args))
    await waitFor(() => expect(result.current.status).toBe('error'))
    act(() => result.current.confirm(args))
    await waitFor(() => expect(result.current.status).toBe('success'))
    const grants = vi.mocked(recordAdvance).mock.calls.map((c) => c[1])
    expect(grants).toEqual(['g-first', 'g-first', 'g-second'])        // kept grant, refused, then the same confirmer's new grant
    expect(vi.mocked(verifyPerson).mock.calls.every((c) => c[0] === 'c1')).toBe(true)
  })
})
