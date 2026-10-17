// Tenant Identity T1 / T3: Hoje's salon line, «Este telemóvel» and the «Limiar» brand moment — once per enrollment,
// skippable from the first instant, still under reduced motion, replayable without re-enrolling, offline-safe.
import { useEffect, useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { OrganizationContext } from '../../../modules/org/OrganizationContext'
import { TenantMarkContext, type TenantMark } from '../../../modules/org/tenantMark'
import { INACTIVE_RUNTIME, OfflineRuntimeContext, type OfflineRuntime } from '../../../shared/offline/runtime'
import { testOrg } from '../../../test/router'

vi.mock('../../../modules/services/api', async (orig) => ({
  ...(await orig<typeof import('../../../modules/services/api')>()),
  getHojeSummary: vi.fn().mockResolvedValue({ total: 0, by_method: [], last_at: null, recent: [] }),
}))
vi.mock('../../../modules/stock/api', async (orig) => ({
  ...(await orig<typeof import('../../../modules/stock/api')>()),
  countMarkedToBuy: vi.fn().mockResolvedValue(0),
}))
vi.mock('../../../modules/org/api', async (orig) => ({
  ...(await orig<typeof import('../../../modules/org/api')>()), readStoredPrincipal: vi.fn(), enrollDevice: vi.fn(),
}))
import { enrollDevice, readStoredPrincipal } from '../../../modules/org/api'
import { EnrollmentScreen } from '../../dispositivo/EnrollmentScreen'
import { HojePage } from '../HojePage'
import { DESCRIPTOR, SYMBOL_INDIGO, SYMBOL_VIOLET, WORDMARK } from './lockup'
import { markEnrolled, markPresented, prefersStill, shouldPresent } from './presentation'

type Org = typeof testOrg
// the logo as the provider would give it; `liveMark` lets a test make it arrive later
let liveMark: (m: TenantMark | null) => void = () => {}
function LiveMark({ initial, children }: { initial: TenantMark | null; children: ReactNode }) {
  const [mark, setMark] = useState(initial)
  useEffect(() => { liveMark = setMark }, [])
  return <TenantMarkContext.Provider value={mark}>{children}</TenantMarkContext.Provider>
}
function renderHoje({ org = testOrg, runtime, mark = null }: { org?: Org; runtime?: Partial<OfflineRuntime>; mark?: TenantMark | null } = {}) {
  const router = createMemoryRouter([{ path: '/', element: <HojePage /> }, { path: '*', element: <p>Outro ecrã</p> }])
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OfflineRuntimeContext.Provider value={{ ...INACTIVE_RUNTIME, ...runtime }}>
        <LiveMark initial={mark}>
          <OrganizationContext.Provider value={org}><RouterProvider router={router} /></OrganizationContext.Provider>
        </LiveMark>
      </OfflineRuntimeContext.Provider>
    </QueryClientProvider>,
  )
  return { router, ...view }
}
const MARK: TenantMark = { src32: 'blob:32', src64: 'blob:64', src512: 'blob:512', ring: { color: '#39783F', radius: 0.393, width: 0.032 }, iris: 0.415 }
const motion = (reduced: boolean) => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduced && q === '(prefers-reduced-motion: reduce)', addEventListener: () => {}, removeEventListener: () => {} }))
  vi.stubGlobal('CSS', { supports: () => true })
}
const main = () => document.querySelector('main')!

beforeEach(() => { localStorage.clear(); vi.mocked(readStoredPrincipal).mockReturnValue('p1'); motion(false) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('presentation: once per device-to-tenant enrollment', () => {
  it('a device enrolled before «Limiar» existed is never presented it automatically', () => {
    expect(shouldPresent('p1', 'o')).toBe(false)
  })
  it('a new enrollment presents it once: starting records it', () => {
    markEnrolled('p1')
    expect(shouldPresent('p1', 'o')).toBe(true)
    markPresented('p1', 'o')
    expect(shouldPresent('p1', 'o')).toBe(false)
  })
  it('only for the identity that enrolled', () => {
    markEnrolled('p1')
    expect(shouldPresent('p2', 'o')).toBe(false)
  })
  it('a new enrollment — another salon, or the same salon under a new identity — presents it again', () => {
    markEnrolled('p1'); markPresented('p1', 'o')
    markEnrolled('p2')
    expect(shouldPresent('p2', 'o2')).toBe(true)
    markPresented('p2', 'o2'); markEnrolled('p3')
    expect(shouldPresent('p3', 'o')).toBe(true)
  })
  it('blocked storage: never presented automatically, nothing thrown', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => markEnrolled('p1')).not.toThrow()
    expect(shouldPresent('p1', 'o')).toBe(false)
    get.mockRestore(); set.mockRestore()
  })
  it('still: reduced motion, or no animatable clip-path', () => {
    expect(prefersStill()).toBe(false)
    motion(true)
    expect(prefersStill()).toBe(true)
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.stubGlobal('CSS', { supports: () => false })
    expect(prefersStill()).toBe(true)
  })
})

describe('the official Beauty OS lockup', () => {
  it('is the brand package\'s compact outlined lockup, path for path', () => {
    const svg = Object.values(import.meta.glob('../../../../sollelio-brand-assets/beauty-os-v0.1/sollelio-beauty-os-logo-compact-outlined.svg',
      { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0]!
    const paths = [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]!.replace(/\s+/g, ' ').trim())
    expect(paths).toEqual([SYMBOL_INDIGO[0], SYMBOL_VIOLET, SYMBOL_INDIGO[1], SYMBOL_INDIGO[2], ...WORDMARK, ...DESCRIPTOR])
  })
})

describe('Hoje · the salon line (T1)', () => {
  it('names the bound organization (organizations.name) and opens «Este telemóvel», even with nothing to send', async () => {
    renderHoje()
    const line = screen.getByRole('button', { name: 'Este telemóvel: ligado a Org' })
    expect(line.textContent).toBe('Org')
    expect(line.compareDocumentPosition(screen.getByRole('heading', { name: 'Hoje' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(line)
    const sheet = await screen.findByRole('dialog', { name: 'Este telemóvel' })
    expect(within(sheet).getByText('Ligado a').nextSibling?.textContent).toBe('Org')
    expect(within(sheet).getByText('Por enviar').nextSibling?.textContent).toBe('0')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  it('a long name stays whole: two lines on screen (CSS), complete for screen readers and in the sheet', async () => {
    const name = 'Estúdio Lua — Unhas, Sobrancelhas & Beleza do Bairro da Maianga, Luanda'
    renderHoje({ org: { ...testOrg, name } })
    const line = screen.getByRole('button', { name: `Este telemóvel: ligado a ${name}` })
    expect(line.querySelector('.tenant-name')?.textContent).toBe(name)
    fireEvent.click(line)
    expect(within(await screen.findByRole('dialog')).getByText(name)).toBeTruthy()
  })
  it('offline, on the cached binding: the line still names the salon and opens the sheet', async () => {
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    renderHoje({ runtime: { connectivity: 'offline', bindingSource: 'cache', partitionActive: true } })
    fireEvent.click(screen.getByRole('button', { name: 'Este telemóvel: ligado a Org' }))
    const sheet = await screen.findByRole('dialog', { name: 'Este telemóvel' })
    expect(within(sheet).getByText('Ligado a').nextSibling?.textContent).toBe('Org')
    expect(within(sheet).getByText('Ligação').nextSibling?.textContent).toBe('Sem ligação')
    onLine.mockRestore()
  })
})

describe('Hoje · «Limiar» (T3)', () => {
  it('an ordinary opening never presents it', async () => {
    renderHoje()
    await screen.findByText('Ainda não há serviços registados hoje.')
    expect(screen.queryByTestId('limiar')).toBeNull()
  })
  it('after enrollment: presented once — announced, «Saltar» first — and skipping leaves Hoje whole, focus on its title', async () => {
    markEnrolled('p1')
    const first = renderHoje()
    const moment = await screen.findByTestId('limiar')
    expect(within(moment).getByRole('status').textContent).toBe('Este telemóvel está ligado a Org')
    expect(document.activeElement).toBe(within(moment).getByRole('button', { name: 'Saltar' }))
    expect(moment.querySelector('.limiar-stage')?.getAttribute('aria-hidden')).toBe('true')
    expect(main().classList.contains('limiar-run')).toBe(true)                 // Hoje assembles beneath
    fireEvent.click(within(moment).getByRole('button', { name: 'Saltar' }))
    await waitFor(() => expect(screen.queryByTestId('limiar')).toBeNull())
    expect(main().classList.contains('limiar-run')).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Hoje' }))
    first.unmount()
    renderHoje()                                                               // reopening: not again
    await screen.findByText('Ainda não há serviços registados hoje.')
    expect(screen.queryByTestId('limiar')).toBeNull()
  })
  it('back (Android) skips it, staying on Hoje', async () => {
    markEnrolled('p1')
    const { router } = renderHoje()
    await screen.findByTestId('limiar')
    await act(() => router.navigate(-1))
    await waitFor(() => expect(screen.queryByTestId('limiar')).toBeNull())
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('heading', { name: 'Hoje' })).toBeTruthy()
  })
  it('ends by itself when Hoje has assembled (4.46 s)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    markEnrolled('p1')
    renderHoje()
    await screen.findByTestId('limiar')
    act(() => { vi.advanceTimersByTime(4400) })
    expect(screen.queryByTestId('limiar')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(60) })
    await waitFor(() => expect(screen.queryByTestId('limiar')).toBeNull())
    expect(main().classList.contains('limiar-run')).toBe(false)
  })
  it('reduced motion: the same composition, still, with «Começar» — Hoje is never hidden', async () => {
    motion(true)
    markEnrolled('p1')
    renderHoje()
    const moment = await screen.findByTestId('limiar')
    expect(moment.classList.contains('limiar-still')).toBe(true)
    expect(main().classList.contains('limiar-run')).toBe(false)
    expect(within(moment).queryByRole('button', { name: 'Saltar' })).toBeNull()
    expect(document.activeElement).toBe(within(moment).getByRole('button', { name: 'Começar' }))
    fireEvent.click(within(moment).getByRole('button', { name: 'Começar' }))
    await waitFor(() => expect(screen.queryByTestId('limiar')).toBeNull())
  })
  it('replay from «Este telemóvel», on an existing enrollment, without re-enrolling', async () => {
    renderHoje()
    fireEvent.click(screen.getByRole('button', { name: 'Este telemóvel: ligado a Org' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ver a apresentação do Beauty OS' }))
    const moment = await screen.findByTestId('limiar')
    expect(screen.queryByRole('dialog', { name: 'Este telemóvel' })).toBeNull()
    expect(within(moment).getByRole('status').textContent).toBe('Este telemóvel está ligado a Org')
    expect(shouldPresent('p1', 'o')).toBe(false)                               // a replay changes nothing
  })
  it('re-enrolled to another salon: presented for the new salon', async () => {
    markEnrolled('p1'); markPresented('p1', 'o')
    vi.mocked(readStoredPrincipal).mockReturnValue('p2')
    markEnrolled('p2')
    renderHoje({ org: { ...testOrg, id: 'o2', name: 'Barbearia Norte' } })
    expect(within(await screen.findByTestId('limiar')).getByRole('status').textContent).toBe('Este telemóvel está ligado a Barbearia Norte')
  })
})

describe('with the organization\'s logo on this phone (T2)', () => {
  it('Hoje\'s salon line shows the 32 px emblem (the 64 file) beside the name; «Ligado a» the 24 px one (the 32 file)', async () => {
    renderHoje({ mark: MARK })
    const line = screen.getByRole('button', { name: 'Este telemóvel: ligado a Org' })
    const img = line.querySelector('img')!
    expect([img.getAttribute('src'), img.getAttribute('alt'), img.hasAttribute('data-tenant-mark'), img.getAttribute('width')]).toEqual(['blob:64', '', true, '32'])
    expect(line.textContent).toBe('Org')
    fireEvent.click(line)
    const row = within(await screen.findByRole('dialog')).getByText('Ligado a').nextSibling as HTMLElement
    expect([row.textContent, row.querySelector('img')?.getAttribute('src'), row.querySelector('img')?.getAttribute('width')]).toEqual(['Org', 'blob:32', '24'])
  })
  it('without it: no image anywhere, the validated name-only line', () => {
    renderHoje()
    expect(screen.getByRole('button', { name: 'Este telemóvel: ligado a Org' }).querySelector('img')).toBeNull()
  })
  it('«Limiar» draws the salon: its ring in the organization\'s own colour and size, the 512 file revealed, then its name', async () => {
    markEnrolled('p1')
    renderHoje({ mark: MARK })
    const moment = await screen.findByTestId('limiar')
    expect(moment.dataset.variant).toBe('emblem')
    const ring = moment.querySelector('circle.lm-ring')!
    expect([ring.getAttribute('stroke'), Number(ring.getAttribute('r')).toFixed(2), Number(ring.getAttribute('stroke-width')).toFixed(2)]).toEqual(['#39783F', '62.88', '5.12'])
    expect(moment.querySelector('img.lm-iris')?.getAttribute('src')).toBe('blob:512')
    const emblem = moment.querySelector<HTMLElement>('.lm-emblem')!
    expect(emblem.style.getPropertyValue('--lm-iris')).toBe('41.5%')
    expect(moment.querySelector('.lm-ename')?.textContent).toBe('Org')
    expect(moment.querySelector('.lm-name')?.closest('.lm-variant')?.classList.contains('lm-off')).toBe(true)   // the name-only variant is not shown
  })
  it('a logo without ring geometry: no ring is drawn — nothing is invented', async () => {
    markEnrolled('p1')
    renderHoje({ mark: { src32: 'blob:32', src64: 'blob:64', src512: 'blob:512' } })
    const moment = await screen.findByTestId('limiar')
    expect(moment.querySelector('circle')).toBeNull()
    expect(moment.querySelector<HTMLElement>('.lm-emblem')!.style.getPropertyValue('--lm-iris')).toBe('71%')
  })
  it('no logo on this phone when the salon\'s part starts (1.5 s): the name-only variant, even if the files arrive later', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    markEnrolled('p1')
    renderHoje()
    const moment = await screen.findByTestId('limiar')
    expect(moment.dataset.variant).toBe('pending')
    act(() => { vi.advanceTimersByTime(1500) })
    expect(moment.dataset.variant).toBe('name')
    act(() => liveMark(MARK))                                                                 // the files arrive at 1.6 s
    expect(screen.getByTestId('limiar').dataset.variant).toBe('name')                         // the salon's part has begun: unchanged
    expect(screen.getByRole('button', { name: 'Este telemóvel: ligado a Org' }).querySelector('img')?.getAttribute('src')).toBe('blob:64')
  })
  it('the files arrive before the salon\'s part (1.5 s): the emblem version', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    markEnrolled('p1')
    renderHoje()
    await screen.findByTestId('limiar')
    act(() => { vi.advanceTimersByTime(900) })
    act(() => liveMark(MARK))
    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.getByTestId('limiar').dataset.variant).toBe('emblem')
  })
  it('reduced motion with the logo: the still composition shows the emblem and the name, with «Começar»', async () => {
    motion(true)
    markEnrolled('p1')
    renderHoje({ mark: MARK })
    const moment = await screen.findByTestId('limiar')
    expect([moment.classList.contains('limiar-still'), moment.dataset.variant]).toEqual([true, 'emblem'])
    expect(moment.querySelector('img.lm-iris')?.getAttribute('src')).toBe('blob:512')
    expect(document.activeElement).toBe(within(moment).getByRole('button', { name: 'Começar' }))
  })
  it('replayed from «Este telemóvel» on an enrolled phone: the emblem version, skippable at once', async () => {
    renderHoje({ mark: MARK })
    fireEvent.click(screen.getByRole('button', { name: 'Este telemóvel: ligado a Org' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ver a apresentação do Beauty OS' }))
    const moment = await screen.findByTestId('limiar')
    expect(moment.dataset.variant).toBe('emblem')
    fireEvent.click(within(moment).getByRole('button', { name: 'Saltar' }))
    await waitFor(() => expect(screen.queryByTestId('limiar')).toBeNull())
    expect(screen.getByRole('button', { name: 'Este telemóvel: ligado a Org' }).querySelector('img')?.getAttribute('src')).toBe('blob:64')
  })
})

describe('enrollment', () => {
  it('a successful enrollment marks the new binding for «Limiar»; a failed one does not', async () => {
    vi.mocked(readStoredPrincipal).mockReturnValue('p9')
    vi.mocked(enrollDevice).mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'ENROLLMENT_INVALID' })).mockResolvedValueOnce(undefined)
    render(<QueryClientProvider client={new QueryClient()}><EnrollmentScreen /></QueryClientProvider>)
    fireEvent.change(screen.getByPlaceholderText('Código de ligação'), { target: { value: 'abcd-efgh' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ligar dispositivo' }))
    await screen.findByRole('alert')
    expect(shouldPresent('p9', 'o')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Ligar dispositivo' }))
    await waitFor(() => expect(shouldPresent('p9', 'o')).toBe(true))
    expect(screen.queryByText(testOrg.name)).toBeNull()                        // an unbound phone shows no salon
  })
})
