import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import type { PrivateStatus } from '../../modules/org/privateContext'

vi.mock('../../modules/catalogue/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/catalogue/api')>()),
  listManagedServices: vi.fn(), listManagedProducts: vi.fn(), saveService: vi.fn(), saveProduct: vi.fn(),
}))
vi.mock('../../modules/org/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/org/api')>()),
  listConfirmers: vi.fn().mockResolvedValue([{ id: 'fer', display_name: 'Fernando' }]), verifyPerson: vi.fn().mockResolvedValue('grant-1'),
}))
vi.mock('../../modules/stock/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/stock/api')>()),
  listUnitWords: vi.fn().mockResolvedValue(['frasco', 'garrafão']),
}))
vi.mock('../../modules/team/situation', async (orig) => ({
  ...(await orig<typeof import('../../modules/team/situation')>()), listTeamPeople: vi.fn().mockResolvedValue([]),
}))
import { listManagedProducts, listManagedServices, saveProduct, saveService } from '../../modules/catalogue/api'
import { listConfirmers, verifyPerson } from '../../modules/org/api'
import { AppError } from '../../shared/errors'
import { GestaoPage } from './GestaoPage'
import { ProductEditPage, ServiceEditPage } from './EditPage'
import { EquipaPage } from '../privado/EquipaPage'

const org = { id: 'o', name: 'Org', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const K = (kz: number) => kz * 100
const ctx = (catalogue_manage: boolean): PrivateStatus => ({ active: true, person_id: 'fer', display_name: 'Fernando', view: 'manager',
  business_health: true, catalogue_manage, expires_at: new Date(Date.now() + 300_000).toISOString() })

function renderAt(path: string, manage = true) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OrganizationContext.Provider value={org}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/privado" element={<Outlet context={ctx(manage)} />}>
              <Route path="equipa" element={<EquipaPage />} />
              <Route path="gestao" element={<GestaoPage />} />
              <Route path="gestao/servico/:id" element={<ServiceEditPage />} />
              <Route path="gestao/produto/:id" element={<ProductEditPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </OrganizationContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(saveService).mockReset().mockResolvedValue({})
  vi.mocked(saveProduct).mockReset().mockResolvedValue({})
  vi.mocked(verifyPerson).mockClear()
  vi.mocked(listManagedServices).mockResolvedValue([
    { id: 's1', name: 'Secar cabelo', default_price_minor: K(1000), active: true, sort_order: 1 },
    { id: 's2', name: 'Brexe', default_price_minor: K(2000), active: true, sort_order: 2 },
    { id: 's3', name: 'Corte antigo', default_price_minor: K(900), active: false, sort_order: 3 },
  ])
  vi.mocked(listManagedProducts).mockResolvedValue([
    { id: 'p1', name: 'Pacote de lima', unit_word: 'pacote', reference_price_minor: K(1700), active: true },
    { id: 'p2', name: 'Gel', unit_word: 'frasco', reference_price_minor: null, active: true },
  ])
})

const pin = (v = '818181') => fireEvent.change(screen.getByLabelText('PIN'), { target: { value: v } })

describe('Gestão', () => {
  it('the entry is offered only to catalogue.manage', async () => {
    const { unmount } = renderAt('/privado/equipa')
    expect(await screen.findByText('Gestão · Serviços e produtos')).toBeTruthy()
    unmount()
    renderAt('/privado/equipa', false)
    await screen.findByText('Fecho do período')
    expect(screen.queryByText('Gestão · Serviços e produtos')).toBeNull()
  })

  it('without catalogue.manage: no list, no edit controls (the database refuses the commands anyway)', async () => {
    renderAt('/privado/gestao', false)
    expect(screen.getByRole('alert').textContent).toMatch(/só para quem tem autorização/)
    expect(screen.queryByText('Adicionar serviço')).toBeNull()
    expect(screen.queryByText('Secar cabelo')).toBeNull()
    expect(listManagedServices).not.toHaveBeenCalled()
  })

  it('lists active services with their price; inactive ones are kept, collapsed; products show unit and reference', async () => {
    renderAt('/privado/gestao')
    const active = await screen.findByRole('region', { name: 'Serviços ativos' })
    expect(within(active).getAllByTestId('catalogue-row').map((r) => r.querySelector('strong')!.textContent)).toEqual(['Secar cabelo', 'Brexe'])
    expect(within(active).getByText('1.000 Kz')).toBeTruthy()
    expect(screen.queryByText('Corte antigo')).toBeNull()
    fireEvent.click(screen.getByText('Desativados · 1'))
    expect(screen.getByText('Corte antigo')).toBeTruthy()
    fireEvent.click(screen.getByText('Produtos'))
    expect(await screen.findByText('pacote · referência 1.700 Kz')).toBeTruthy()
    expect(screen.getByText('frasco')).toBeTruthy()
  })

  it('edit a service price: before → after, the verified manager confirms, the command gets the new price', async () => {
    renderAt('/privado/gestao/servico/s1')
    const price = await screen.findByLabelText('Preço atual')
    expect((price as HTMLInputElement).value).toBe('1.000')
    fireEvent.change(price, { target: { value: '1200' } })
    fireEvent.click(screen.getByText('Continuar'))
    expect(within(screen.getByTestId('changes')).getByText('1.000 Kz → 1.200 Kz')).toBeTruthy()
    expect(listConfirmers).toHaveBeenCalledWith('catalogue.manage')
    pin()
    fireEvent.click(screen.getByText('Guardar'))
    await waitFor(() => expect(saveService).toHaveBeenCalled())
    expect(verifyPerson).toHaveBeenCalledWith('fer', '818181')
    const [commandId, grantId, input] = vi.mocked(saveService).mock.calls[0]!
    expect(typeof commandId).toBe('string')
    expect(grantId).toBe('grant-1')
    expect(input).toEqual({ id: 's1', name: 'Secar cabelo', price_minor: K(1200), active: true })
  })

  it('deactivate a service; a duplicate name is refused with a plain message', async () => {
    vi.mocked(saveService).mockRejectedValueOnce(new AppError('domain', 'NAME_TAKEN', 'NAME_TAKEN'))
    renderAt('/privado/gestao/servico/s2')
    fireEvent.click(await screen.findByText('Desativado'))
    expect(screen.getByText(/Deixa de aparecer nas escolhas novas/)).toBeTruthy()
    fireEvent.click(screen.getByText('Continuar'))
    expect(screen.getByText('Ativo → Desativado')).toBeTruthy()
    pin()
    fireEvent.click(screen.getByText('Guardar'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Já existe um item com este nome/)
    expect(vi.mocked(saveService).mock.calls[0]![2]).toEqual({ id: 's2', name: 'Brexe', price_minor: K(2000), active: false })
  })

  it('add a service: name and price required', async () => {
    renderAt('/privado/gestao/servico/novo')
    expect((screen.getByText('Continuar') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  Acertar sobrancelhas ' } })
    fireEvent.change(screen.getByLabelText('Preço atual'), { target: { value: '300' } })
    expect(screen.queryByText('Estado')).toBeNull()
    fireEvent.click(screen.getByText('Continuar'))
    pin()
    fireEvent.click(screen.getByText('Guardar'))
    await waitFor(() => expect(saveService).toHaveBeenCalled())
    expect(vi.mocked(saveService).mock.calls[0]![2]).toEqual({ id: null, name: 'Acertar sobrancelhas', price_minor: K(300), active: true })
  })

  it('edit a product: a new unit word and the reference price; deactivate', async () => {
    renderAt('/privado/gestao/produto/p2')
    fireEvent.click(await screen.findByText('Outra…'))
    fireEvent.change(screen.getByLabelText('Outra unidade'), { target: { value: 'garrafa 1 L' } })
    fireEvent.change(screen.getByLabelText('Preço de referência'), { target: { value: '7000' } })
    fireEvent.click(screen.getByText('Desativado'))
    fireEvent.click(screen.getByText('Continuar'))
    expect(screen.getByText('frasco → garrafa 1 L')).toBeTruthy()
    expect(screen.getByText('— → 7.000 Kz')).toBeTruthy()
    pin()
    fireEvent.click(screen.getByText('Guardar'))
    await waitFor(() => expect(saveProduct).toHaveBeenCalled())
    expect(vi.mocked(saveProduct).mock.calls[0]![2]).toEqual({ id: 'p2', name: 'Gel', unit_word: 'garrafa 1 L', reference_price_minor: K(7000), active: false })
  })

  it('add a product with an existing unit word and no reference price', async () => {
    renderAt('/privado/gestao/produto/novo')
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Verniz' } })
    fireEvent.click(await screen.findByText('frasco'))
    fireEvent.click(screen.getByText('Continuar'))
    pin()
    fireEvent.click(screen.getByText('Guardar'))
    await waitFor(() => expect(saveProduct).toHaveBeenCalled())
    expect(vi.mocked(saveProduct).mock.calls[0]![2]).toEqual({ id: null, name: 'Verniz', unit_word: 'frasco', reference_price_minor: null, active: true })
  })
})
