import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import { AppError } from '../../shared/errors'

vi.mock('../../modules/org/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/org/api')>()),
  listConfirmers: vi.fn().mockResolvedValue([{ id: 'm1', display_name: 'Mercy' }]),
  verifyPerson: vi.fn().mockResolvedValue('g1'),
}))
vi.mock('../../modules/corrections/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/corrections/api')>()),
  getRecordSummary: vi.fn(), cancelRecord: vi.fn(),
}))
import { listConfirmers } from '../../modules/org/api'
import { cancelRecord, getRecordSummary, type RecordSummary } from '../../modules/corrections/api'
import { CancelRecordFlow } from './CancelRecordFlow'

const org = { id: 'o', name: 'Org', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const svc: RecordSummary = { kind: 'service', occurred_at: '2026-10-07T09:15:00Z', amount_minor: 350000, title: 'Corte', person: 'Ana', cancelled: null }
const renderAt = (path = '/registos/anular/service/r1') => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <OrganizationContext.Provider value={org}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/registos/anular/:kind/:recordId" element={<CancelRecordFlow />} />
          <Route path="/servicos/registar" element={<p>Registar serviço</p>} />
        </Routes>
      </MemoryRouter>
    </OrganizationContext.Provider>
  </QueryClientProvider>,
)
beforeEach(() => { vi.mocked(getRecordSummary).mockReset(); vi.mocked(cancelRecord).mockReset() })

describe('Anular registo', () => {
  it('shows what is cancelled, needs a reason, then a confirmer who may correct', async () => {
    vi.mocked(getRecordSummary).mockResolvedValue(svc)
    renderAt()
    expect((await screen.findByTestId('cancel-what')).textContent).toContain('Serviço · Corte')
    expect(screen.getByText(/Nada é apagado/)).toBeTruthy()
    expect(screen.queryByLabelText('PIN')).toBeNull()
    expect((screen.getByRole('button', { name: 'Anular registo' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Motivo (obrigatório)'), { target: { value: 'Valor errado' } })
    expect(await screen.findByLabelText('PIN')).toBeTruthy()
    expect(listConfirmers).toHaveBeenCalledWith('records.correct')
  })
  it('confirms with verification; success says nothing was deleted and offers the normal flow; the original is no longer active', async () => {
    vi.mocked(getRecordSummary).mockResolvedValueOnce(svc).mockResolvedValue({ ...svc, cancelled: { at: '2026-10-07T09:20:00Z', reason: 'Valor errado', by: 'Mercy' } })
    vi.mocked(cancelRecord).mockResolvedValue({ cancellation_id: 'c1', cancelled_at: '2026-10-07T09:20:00Z' })
    renderAt()
    fireEvent.change(await screen.findByLabelText('Motivo (obrigatório)'), { target: { value: '  Valor errado ' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Mercy' }))
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '135790' } })
    fireEvent.click(screen.getByRole('button', { name: 'Anular registo' }))
    expect(await screen.findByText('Registo anulado.')).toBeTruthy()
    expect(vi.mocked(cancelRecord).mock.calls[0]![1]).toBe('g1')
    expect(vi.mocked(cancelRecord).mock.calls[0]![2]).toEqual({ kind: 'service', recordId: 'r1', reason: 'Valor errado' })
    expect(await screen.findByText(/Anulado por Mercy · 7 out às 10:20 · motivo: Valor errado/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Registar de novo, com o valor certo' }))
    expect(await screen.findByText('Registar serviço')).toBeTruthy()
  })
  it('an already cancelled record shows its cancelled state, not the form', async () => {
    vi.mocked(getRecordSummary).mockResolvedValue({ ...svc, cancelled: { at: '2026-10-07T09:20:00Z', reason: 'Duplicado', by: 'Mercy' } })
    renderAt()
    expect(await screen.findByText('Este registo já foi anulado.')).toBeTruthy()
    expect(screen.queryByLabelText('Motivo (obrigatório)')).toBeNull()
  })
  it('explains why a record in an approved period cannot be cancelled', async () => {
    vi.mocked(getRecordSummary).mockResolvedValue(svc)
    vi.mocked(cancelRecord).mockRejectedValue(new AppError('domain', 'PERIOD_APPROVED', 'PERIOD_APPROVED'))
    renderAt()
    fireEvent.change(await screen.findByLabelText('Motivo (obrigatório)'), { target: { value: 'x' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Mercy' }))
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '135790' } })
    fireEvent.click(screen.getByRole('button', { name: 'Anular registo' }))
    await waitFor(() => expect(screen.getByText(/já tem os valores aprovados: não é possível anular/)).toBeTruthy())
  })
})
