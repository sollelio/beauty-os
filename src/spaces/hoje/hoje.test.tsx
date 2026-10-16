import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import { renderScreen } from '../../test/router'

vi.mock('../../modules/services/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/services/api')>()),
  getHojeSummary: vi.fn().mockResolvedValue({ total: 0, by_method: [], last_at: null, recent: [] }),
}))
vi.mock('../../modules/stock/api', async (orig) => ({
  ...(await orig<typeof import('../../modules/stock/api')>()),
  countMarkedToBuy: vi.fn().mockResolvedValue(2),
}))
import { HojePage } from './HojePage'
import { INACTIVE_RUNTIME, OfflineRuntimeContext } from '../../shared/offline/runtime'
import type { LocalStatus } from '../../shared/offline/status'

const org = { id: 'o', name: 'Org', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const renderIt = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <OrganizationContext.Provider value={org}><MemoryRouter><HojePage /></MemoryRouter></OrganizationContext.Provider>
  </QueryClientProvider>,
)
const href = (el: HTMLElement) => el.getAttribute('href')

describe('Hoje', () => {
  it('Registar serviço is the main action; every secondary destination is still reachable, grouped', async () => {
    renderIt()
    expect(href(screen.getByRole('link', { name: 'Registar serviço' }))).toBe('/servicos/registar')
    const other = screen.getByRole('navigation', { name: 'Outras ações' })
    expect(href(within(other).getByRole('link', { name: 'Adiantamento' }))).toBe('/equipa/adiantamento')
    expect(within(other).getByRole('button', { name: 'Despesa ou compra' })).toBeTruthy()
    expect(href(within(other).getByRole('link', { name: 'Stock' }))).toBe('/stock')
    const priv = screen.getByRole('navigation', { name: 'Privado' })
    expect(within(priv).getAllByRole('link').map(href)).toEqual(['/privado/entrar', '/privado/fecho', '/privado/negocio'])
    expect(within(priv).getAllByRole('link').map((a) => a.textContent)).toEqual(['Área privada', 'Fecho', 'Negócio'])
    expect(await screen.findByText('2 produtos marcados a comprar')).toBeTruthy()
    expect(await screen.findByText('Ainda não há serviços registados hoje.')).toBeTruthy()
  })

  it('Ajuda (L2): one quiet row, the last thing on Hoje, after everything operational', () => {
    const { container } = renderIt()
    const help = screen.getByRole('navigation', { name: 'Ajuda' })
    expect(within(help).getAllByRole('link').map(href)).toEqual(['/ajuda'])
    expect(within(help).getByRole('link').textContent).toContain('Ajuda')
    const navs = [...container.querySelectorAll('nav')].map((n) => n.getAttribute('aria-label'))
    expect(navs).toEqual(['Outras ações', 'Privado', 'Ajuda'])
    expect(container.querySelector('main')!.lastElementChild).toBe(help)
  })

  it('Despesa ou compra opens the chooser, which can be cancelled', () => {
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: 'Despesa ou compra' }))
    const sheet = screen.getByRole('dialog', { name: 'O que quer registar?' })
    expect(within(sheet).getByRole('button', { name: /Registar despesa/ })).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: /Registar compra/ })).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the chooser closes with Android back; choosing replaces it, so back from the flow returns to Hoje', async () => {
    const { router } = renderScreen('/inicio', <HojePage />, { routes: [{ path: '/dinheiro/despesa', element: <p>Despesa</p> }] })
    fireEvent.click(screen.getByRole('button', { name: 'Despesa ou compra' }))
    await screen.findByRole('dialog', { name: 'O que quer registar?' })
    await act(() => router.navigate(-1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/inicio')
    fireEvent.click(screen.getByRole('button', { name: 'Despesa ou compra' }))
    fireEvent.click(await screen.findByRole('button', { name: /Registar despesa/ }))
    expect(await screen.findByText('Despesa')).toBeTruthy()
    expect(router.state.location.state).toEqual({ from: '/' })
    await act(() => router.navigate(-1))
    expect(await screen.findByRole('button', { name: 'Despesa ou compra' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Hoje · local work (Offline 3)', () => {
  const local = (over: Partial<LocalStatus>): LocalStatus => ({ schemaVersion: 1, outboxPending: 0, outboxFailed: 0, outboxConflicts: 0, draftsPending: 0,
    draftsReview: 0, lastSuccessfulSyncAt: null, foreign: { partitions: 2, unsyncedWork: 9 }, ...over })
  const withLocal = (l: LocalStatus | null) => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OrganizationContext.Provider value={org}>
        <OfflineRuntimeContext.Provider value={{ ...INACTIVE_RUNTIME, partitionActive: !!l, storage: l ? 'ready' : 'none', local: l }}>
          <MemoryRouter><HojePage /></MemoryRouter>
        </OfflineRuntimeContext.Provider>
      </OrganizationContext.Provider>
    </QueryClientProvider>,
  )
  it('no row without local work — other partitions\' work is never counted here', async () => {
    withLocal(local({}))
    await screen.findByText('Ainda não há serviços registados hoje.')
    expect(screen.queryByRole('region', { name: 'Neste telemóvel' })).toBeNull()
    expect(screen.queryByText(/por enviar|por confirmar/)).toBeNull()
  })
  it('no row on a device without an active partition', async () => {
    withLocal(null)
    await screen.findByText('Ainda não há serviços registados hoje.')
    expect(screen.queryByText(/por enviar/)).toBeNull()
  })
  it('to send, to confirm with PIN and to review are separate rows, apart from the server figures', async () => {
    withLocal(local({ outboxPending: 3, outboxConflicts: 1, draftsPending: 3, draftsReview: 1 }))
    const row = await screen.findByRole('button', { name: /2 registos por enviar/ })
    expect(row.textContent).not.toMatch(/confirmar|rever/)
    expect(screen.getByRole('link', { name: /2 por confirmar com PIN/ }).getAttribute('href')).toBe('/rascunhos')
    expect(screen.getByRole('link', { name: /2 para rever/ }).getAttribute('href')).toBe('/rever')
    expect((await screen.findByTestId('count-line')).textContent).not.toMatch(/registos por|rever/)
    fireEvent.click(row)
    expect(await screen.findByRole('heading', { name: 'Neste telemóvel' })).toBeTruthy()
    expect(within(screen.getByTestId('sync-status')).getByText('Por enviar').nextSibling?.textContent).toBe('2')
  })
})

describe('Hoje · offline (Offline 4)', () => {
  it('server figures as last read carry their time; local work stays a separate row', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <OrganizationContext.Provider value={org}>
          <OfflineRuntimeContext.Provider value={{ ...INACTIVE_RUNTIME, partitionActive: true, bindingSource: 'cache', storage: 'ready',
            local: { schemaVersion: 2, outboxPending: 1, outboxFailed: 0, outboxConflicts: 0, draftsPending: 0, draftsReview: 0, lastSuccessfulSyncAt: null, foreign: { partitions: 0, unsyncedWork: 0 } } }}>
            <MemoryRouter><HojePage /></MemoryRouter>
          </OfflineRuntimeContext.Provider>
        </OrganizationContext.Provider>
      </QueryClientProvider>,
    )
    expect((await screen.findByTestId('hoje-updated')).textContent).toMatch(/^Atualizado às \d{2}:\d{2}$/)
    expect(screen.getByTestId('count-line').textContent).toBe('Ainda não há serviços registados hoje.')     // not 1
    expect(screen.getByRole('button', { name: /1 registo por enviar/ })).toBeTruthy()
  })
  it('online: no "Atualizado" line', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <OrganizationContext.Provider value={org}><MemoryRouter><HojePage /></MemoryRouter></OrganizationContext.Provider>
      </QueryClientProvider>,
    )
    await screen.findByTestId('count-line')
    expect(screen.queryByTestId('hoje-updated')).toBeNull()
  })
})

describe('Hoje · opened without a connection (Offline 5)', () => {
  it('no server figures: a calm note, no error, no zero; local work still shown apart', async () => {
    const { getHojeSummary } = await import('../../modules/services/api')
    vi.mocked(getHojeSummary).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <OrganizationContext.Provider value={org}>
          <OfflineRuntimeContext.Provider value={{ ...INACTIVE_RUNTIME, partitionActive: true, bindingSource: 'cache', storage: 'ready',
            local: { schemaVersion: 2, outboxPending: 1, outboxFailed: 0, outboxConflicts: 0, draftsPending: 0, draftsReview: 0, lastSuccessfulSyncAt: null, foreign: { partitions: 0, unsyncedWork: 0 } } }}>
            <MemoryRouter><HojePage /></MemoryRouter>
          </OfflineRuntimeContext.Provider>
        </OrganizationContext.Provider>
      </QueryClientProvider>,
    )
    expect((await screen.findByTestId('hoje-offline-note')).textContent).toBe('Sem ligação: os registos de hoje aparecem quando houver ligação.')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByTestId('count-line')).toBeNull()
    expect(screen.queryByText(/Ainda não há serviços/)).toBeNull()
    expect(screen.getByRole('button', { name: /1 registo por enviar/ })).toBeTruthy()
  })
})

