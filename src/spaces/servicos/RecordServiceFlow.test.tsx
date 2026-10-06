import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'

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
import { RecordServiceFlow } from './RecordServiceFlow'

const org = { id: 'o', name: 'Org', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }

describe('RecordServiceFlow validation', () => {
  it('keeps Confirmar disabled until mixed parts add up to the value', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OrganizationContext.Provider value={org}>
          <MemoryRouter><RecordServiceFlow /></MemoryRouter>
        </OrganizationContext.Provider>
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByText('Ana'))
    fireEvent.click(await screen.findByText('Coloração'))
    const confirm = await screen.findByRole('button', { name: 'Confirmar serviço' })
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Misto' }))
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Numerário'), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText('Transferência'), { target: { value: '1000' } })
    expect(screen.getByTestId('mixed-sentence').textContent).toBe('Soma 11.000 Kz. Faltam 1.000 Kz para chegar aos 12.000 Kz.')
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Transferência'), { target: { value: '2000' } })
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
  })
})
