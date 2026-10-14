import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
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

// A data router (the editors' back contract uses useBlocker); `entries` gives the history behind the screen.
function renderAt(path: string, manage = true, entries?: string[]) {
  const router = createMemoryRouter([
    { path: '/privado', element: <Outlet context={ctx(manage)} />, children: [
      { path: 'equipa', element: <EquipaPage /> },
      { path: 'gestao', element: <GestaoPage /> },
      { path: 'gestao/servico/:id', element: <ServiceEditPage /> },
      { path: 'gestao/produto/:id', element: <ProductEditPage /> },
    ] },
    { path: '/', element: <p>Ecrã Hoje</p> },
    { path: '*', element: <p>Outro ecrã</p> },
  ], { initialEntries: entries ?? [path], initialIndex: entries ? entries.length - 1 : 0 })
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OrganizationContext.Provider value={org}><RouterProvider router={router} /></OrganizationContext.Provider>
    </QueryClientProvider>,
  )
  return { ...view, router }
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
    const deactivate = await screen.findByRole('button', { name: 'Desativar serviço' })
    expect(deactivate.className).toBe('btn btn-destructive')
    expect(screen.getByText(/Deixa de aparecer nas escolhas novas/)).toBeTruthy()
    fireEvent.click(deactivate)
    expect(await screen.findByText('Ativo → Desativado')).toBeTruthy()
    pin()
    const final = screen.getByRole('button', { name: 'Desativar' })
    expect(final.className).toContain('btn-danger')
    fireEvent.click(final)
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
    fireEvent.click(screen.getByRole('button', { name: 'Desativar produto' }))          // the edits travel with the deactivation
    expect(await screen.findByText('frasco → garrafa 1 L')).toBeTruthy()
    expect(screen.getByText('— → 7.000 Kz')).toBeTruthy()
    expect(screen.getByText('Ativo → Desativado')).toBeTruthy()
    pin()
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))
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

// UX slice 9: Gestão on the private mobile shell.
describe('Gestão · private navigation and states', () => {
  it('opened from Equipa: ← returns to Equipa (history), never to Hoje; rows are whole rows; no glyphs', async () => {
    const { router } = renderAt('/privado/gestao', true, ['/privado/equipa', '/privado/gestao'])
    const rows = await screen.findAllByTestId('catalogue-row')
    expect(within(rows[0]!).getByRole('button').className).toContain('row-tappable')
    for (const b of screen.getAllByRole('button')) expect(b.textContent ?? '').not.toMatch(/[←›▾▴×]/)
    expect(document.querySelector('.app-bar')!.textContent).toContain('Área privada · Fernando')
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByText('Fecho do período')).toBeTruthy()                       // Equipa
    expect(router.state.historyAction).toBe('POP')
  })
  it('a deep link falls back to the private root; Sair leaves for Hoje', async () => {
    const { router } = renderAt('/privado/gestao')
    await screen.findAllByTestId('catalogue-row')
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/privado'))
    expect(screen.queryByText('Ecrã Hoje')).toBeNull()
    await act(() => router.navigate('/privado/gestao'))
    fireEvent.click(await screen.findByRole('button', { name: 'Sair da área privada' }))
    expect(await screen.findByText('Ecrã Hoje')).toBeTruthy()
  })
  it('loading is a skeleton; a failed load is an alert with Retry that works; an empty catalogue says so', async () => {
    vi.mocked(listManagedServices).mockReset().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([])
    renderAt('/privado/gestao')
    expect(screen.getByRole('status', { name: 'A carregar' })).toBeTruthy()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Não foi possível carregar o catálogo.')
    expect(screen.queryByText('Nenhum serviço ativo.')).toBeNull()
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Nenhum serviço ativo.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Gestão · editors: drafts, failures, no stale editor', () => {
  it('leaving a service with an unsaved price asks first; Continuar a editar keeps it', async () => {
    const { router } = renderAt('/privado/gestao/servico/s1', true, ['/privado/gestao', '/privado/gestao/servico/s1'])
    fireEvent.change(await screen.findByLabelText('Preço atual'), { target: { value: '1500' } })
    await act(() => router.navigate(-1))
    expect(await screen.findByRole('dialog', { name: 'Sair sem guardar?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a editar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((screen.getByLabelText('Preço atual') as HTMLInputElement).value).toBe('1.500')
    expect(saveService).not.toHaveBeenCalled()
  })
  it('Confirmação is its own entry: back returns to the form with the edits; a failed save keeps them; success leaves no editor behind', async () => {
    vi.mocked(saveService).mockRejectedValueOnce(new AppError('network', 'Failed to fetch'))
    const { router } = renderAt('/privado/gestao/servico/s1', true, ['/privado/gestao', '/privado/gestao/servico/s1'])
    fireEvent.change(await screen.findByLabelText('Preço atual'), { target: { value: '1200' } })
    fireEvent.click(screen.getByText('Continuar'))
    expect(await screen.findByText('Confirmação necessária')).toBeTruthy()
    await act(() => router.navigate(-1))                                                   // Android back: the form, as typed
    expect(((await screen.findByLabelText('Preço atual')) as HTMLInputElement).value).toBe('1.200')
    fireEvent.click(screen.getByText('Continuar'))
    pin()
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Nada mudou; tente novamente.')
    expect(within(screen.getByTestId('changes')).getByText('1.000 Kz → 1.200 Kz')).toBeTruthy()   // still there
    pin()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(saveService).toHaveBeenCalledTimes(2))
    expect(vi.mocked(saveService).mock.calls[1]![0]).toBe(vi.mocked(saveService).mock.calls[0]![0])   // the same intent (ADR-0006)
    await waitFor(() => expect(router.state.location.pathname).toBe('/privado/gestao'))
    expect(router.state.historyAction).toBe('POP')                                         // the editor was unwound, not stacked
    expect(await screen.findAllByTestId('catalogue-row')).toBeTruthy()
  })
  it('a product with an unsaved name asks before leaving; a refused save keeps the draft', async () => {
    vi.mocked(saveProduct).mockRejectedValueOnce(new AppError('domain', 'NAME_TAKEN', 'NAME_TAKEN'))
    const { router } = renderAt('/privado/gestao/produto/p2', true, ['/privado/gestao?t=produtos', '/privado/gestao/produto/p2'])
    fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Gel UV' } })
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByRole('dialog', { name: 'Sair sem guardar?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a editar' }))
    fireEvent.click(screen.getByText('Continuar'))
    pin()
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Já existe um item com este nome/)
    await act(() => router.navigate(-1))
    expect(((await screen.findByLabelText('Nome')) as HTMLInputElement).value).toBe('Gel UV')
  })
  it('a deactivated entry offers Reativar (not destructive), through the same confirmation', async () => {
    renderAt('/privado/gestao/servico/s3')
    const reactivate = await screen.findByRole('button', { name: 'Reativar serviço' })
    expect(reactivate.className).toBe('btn btn-secondary')
    expect(screen.queryByRole('button', { name: 'Desativar serviço' })).toBeNull()
    fireEvent.click(reactivate)
    expect(await screen.findByText('Desativado → Ativo')).toBeTruthy()
    pin()
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }))
    await waitFor(() => expect(saveService).toHaveBeenCalled())
    expect(vi.mocked(saveService).mock.calls[0]![2]).toEqual({ id: 's3', name: 'Corte antigo', price_minor: K(900), active: true })
  })
})

describe('Gestão · security and reference price', () => {
  it('every write is confirmed by a catalogue.manage holder with the PIN before the command runs', async () => {
    renderAt('/privado/gestao/produto/p1')
    fireEvent.change(await screen.findByLabelText('Preço de referência'), { target: { value: '1800' } })
    fireEvent.click(screen.getByText('Continuar'))
    expect(listConfirmers).toHaveBeenCalledWith('catalogue.manage')
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true)   // no PIN, no command
    pin()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(saveProduct).toHaveBeenCalled())
    expect(vi.mocked(verifyPerson).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(saveProduct).mock.invocationCallOrder[0]!)
    expect(vi.mocked(saveProduct).mock.calls[0]![1]).toBe('grant-1')
  })
  it('a reference price change is a product change only: the command carries the product, never a purchase', async () => {
    renderAt('/privado/gestao/produto/p1')
    expect(await screen.findByText(/as compras anteriores não mudam/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Preço de referência'), { target: { value: '1800' } })
    fireEvent.click(screen.getByText('Continuar'))
    pin()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(saveProduct).toHaveBeenCalled())
    expect(Object.keys(vi.mocked(saveProduct).mock.calls[0]![2]).sort()).toEqual(['active', 'id', 'name', 'reference_price_minor', 'unit_word'])
    expect(vi.mocked(saveProduct).mock.calls[0]![2]).toEqual({ id: 'p1', name: 'Pacote de lima', unit_word: 'pacote', reference_price_minor: K(1800), active: true })
  })
})
