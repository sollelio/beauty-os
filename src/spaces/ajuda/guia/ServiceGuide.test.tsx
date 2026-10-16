// Learning experience L4b · the Interactive Guide «Como registar um serviço»: the real Registar serviço screens with
// synthetic data, the six-step sequence (by doing or with «Seguinte»), the app's back contract, the return to the Help
// topic, accessible guidance — and absolute isolation: no server, no operational module, no device storage.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type InitialEntry } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { fail } = vi.hoisted(() => ({ fail: (what: string) => vi.fn(() => { throw new Error(`the guide must not ${what}`) }) }))
vi.mock('../../../shared/supabase/client', () => ({ getSupabase: fail('use Supabase'), authStorageKey: fail('read the session') }))
vi.mock('../../../modules/services/api', async (orig) => ({
  ...(await orig<typeof import('../../../modules/services/api')>()),
  recordService: fail('record a service'), submitQueuedService: fail('send a queued service'),
  listCapturePeople: fail('read the team'), listFrequentServices: fail('read frequent services'), listPaymentMethods: fail('read payment methods'),
}))
vi.mock('../../../modules/catalogue/api', async (orig) => ({ ...(await orig<typeof import('../../../modules/catalogue/api')>()), listServices: fail('read the catalogue') }))
vi.mock('../../../modules/services/useRecordService', () => ({ useRecordService: fail('use the record hook') }))
vi.mock('../../../modules/services/useCaptureData', () => ({ useCaptureData: fail('use the capture data') }))
import { getSupabase } from '../../../shared/supabase/client'
import * as servicesApi from '../../../modules/services/api'
import { OrganizationContext } from '../../../modules/org/OrganizationContext'
import { HelpTopicPage } from '../HelpPages'
import { GUIDE_TOPIC, ServiceGuidePage } from './ServiceGuide'
import { TOPICS } from '../topics'

const kz = { id: 'o', name: 'Exemplo', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const eur = { ...kz, currency_code: 'EUR', currency_symbol: '€', timezone: 'Europe/Lisbon' }
const TOPIC = '/ajuda/registar-servico', GUIDE = `${TOPIC}/tutorial`

function mount(entries: InitialEntry[] = [TOPIC, GUIDE], index = entries.length - 1, org: typeof kz | null = kz) {
  const router = createMemoryRouter([
    { path: '/', element: <p>Ecrã Hoje</p> },
    { path: '/ajuda', element: <p>Ajuda</p> },
    { path: '/ajuda/:tema', element: <HelpTopicPage /> },
    { path: '/ajuda/:tema/tutorial', element: <ServiceGuidePage /> },
  ], { initialEntries: entries, initialIndex: index })
  // deliberately no QueryClientProvider and no offline runtime: the guide needs neither
  return { router, ...render(<OrganizationContext.Provider value={org}><RouterProvider router={router} /></OrganizationContext.Provider>) }
}
const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const coach = () => screen.getByRole('region', { name: 'Demonstração: instruções' })
const coachTap = (name: string) => fireEvent.click(within(coach()).getByRole('button', { name }))
const target = () => document.querySelector('[data-guide-target]')
const where = (r: ReturnType<typeof mount>['router']) => r.state.location.pathname + r.state.location.search
const start = () => tap('Começar demonstração')
const back = async (r: ReturnType<typeof mount>['router'], n = -1) => { await act(() => r.navigate(n)) }

describe('entry', () => {
  it('the topic offers the tutorial (Kz, €); it opens on its intro, inside the demonstration band', () => {
    for (const org of [kz, eur]) {
      const { unmount } = mount([TOPIC], 0, org)
      const row = screen.getByRole('link', { name: /Tutorial interativo/ })
      expect(row.getAttribute('href')).toBe(GUIDE)
      expect(row.textContent).toContain('Cerca de 1 minuto · funciona sem ligação · nada fica registado')
      unmount()
    }
    mount()
    expect(screen.getByRole('status').textContent).toBe('Demonstração · nada fica registado')
    expect(screen.getByRole('heading', { name: 'Como registar um serviço' })).toBeTruthy()
    expect(screen.getByText(/Nada do que fizer aqui fica registado/)).toBeTruthy()
    expect(screen.getByText(/Não precisa de ligação nem de PIN/)).toBeTruthy()
  })
  it('a currency without example prices (USD): no tutorial row, and the address returns to the topic', () => {
    const usd = { ...kz, currency_code: 'USD', currency_symbol: 'US$' }
    const { unmount } = mount([TOPIC], 0, usd)
    expect(screen.queryByText(/Tutorial/)).toBeNull()
    unmount()
    const { router } = mount([GUIDE], 0, usd)
    expect(router.state.location.pathname).toBe(TOPIC)
    expect(router.state.historyAction).toBe('REPLACE')
  })
  it('only «Registar um serviço» has the tutorial: another topic\'s address returns to that topic', () => {
    expect(TOPICS.filter((t) => t.tutorial).map((t) => t.id)).toEqual([GUIDE_TOPIC])
    const { router } = mount(['/ajuda/despesa/tutorial'], 0)
    expect(router.state.location.pathname).toBe('/ajuda/despesa')
    expect(screen.queryByText(/Tutorial/)).toBeNull()
  })
  it('«Agora não» returns to the topic that opened it', async () => {
    const { router } = mount()
    tap('Agora não')
    await screen.findByRole('link', { name: /Tutorial interativo/ })
    expect(where(router)).toBe(TOPIC)
  })
})

describe('the six steps, by doing', () => {
  it('Joana → Corte → Editar → Transferência → Confirmar serviço → success → closing screen → back to the topic', async () => {
    const { router } = mount(['/', TOPIC, GUIDE])
    start()
    // 1 · the real «Quem fez o serviço?» with one highlighted person
    expect(within(coach()).getByText('Passo 1 de 6')).toBeTruthy()
    expect(within(coach()).getByText('Toque em Joana.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Quem fez o serviço?' })).toBeTruthy()
    expect(target()?.textContent).toBe('JoanaCabelo · Unhas')
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy()                 // the app's own ×
    fireEvent.click(target()!)
    // 2 · «Que serviço?»: frequent first, Corte highlighted
    expect(where(router)).toBe(`${GUIDE}?passo=2`)
    expect(screen.getByText('Frequentes de Joana')).toBeTruthy()
    expect(target()?.querySelector('.row-title')?.textContent).toBe('Corte')
    expect(target()?.textContent).toContain('3.500 Kz')
    fireEvent.click(target()!)
    // 3 · «Valor e pagamento»: Editar highlighted
    expect(where(router)).toBe(`${GUIDE}?passo=3`)
    expect(screen.getByText('3.500 Kz')).toBeTruthy()
    expect(target()?.textContent).toBe('Editar')
    fireEvent.click(target()!)
    // 4 · the value field opens, as in the app; Transferência highlighted
    expect(where(router)).toBe(`${GUIDE}?passo=4`)
    expect(screen.getByLabelText('Valor')).toBeTruthy()
    expect(target()?.textContent).toBe('Transferência')
    fireEvent.click(target()!)
    // 5 · Confirmar serviço highlighted, with the app's summary bar
    expect(where(router)).toBe(`${GUIDE}?passo=5`)
    expect(screen.getByText('Corte · Joana · 3.500 Kz')).toBeTruthy()
    expect(target()?.textContent).toBe('Confirmar serviço')
    fireEvent.click(target()!)
    // 6 · the simulated success screen; nothing to highlight
    expect(where(router)).toBe(`${GUIDE}?passo=6`)
    expect(screen.getByRole('heading', { name: 'Serviço registado com sucesso.' })).toBeTruthy()
    expect(screen.getByText('Corte · Joana · Transferência')).toBeTruthy()
    expect(within(coach()).getByText('Pronto.')).toBeTruthy()
    expect(target()).toBeNull()
    coachTap('Terminar')
    // the closing screen
    expect(screen.getByRole('heading', { name: 'Demonstração terminada' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Demonstração · nada ficou registado')
    tap('Fechar')
    await screen.findByRole('link', { name: /Tutorial interativo/ })
    expect(where(router)).toBe(TOPIC)
    await back(router)
    expect(where(router)).toBe('/')                                                  // the guide's entries are unwound
  })
  it('the persistent band is on every screen', () => {
    mount()
    start()
    for (let i = 0; i < 6; i++) {
      expect(screen.getByRole('status').textContent).toMatch(/^Demonstração · nada fica registado$/)
      coachTap(i === 5 ? 'Terminar' : 'Seguinte')
    }
    expect(screen.getByRole('status').textContent).toBe('Demonstração · nada ficou registado')
  })
})

describe('«Seguinte» and «Anterior»', () => {
  it('«Seguinte» does the highlighted action; «Anterior» returns a step with the data intact', () => {
    const { router } = mount()
    start()
    expect((within(coach()).getByRole('button', { name: 'Anterior' }) as HTMLButtonElement).disabled).toBe(true)
    coachTap('Seguinte')
    expect(screen.getByRole('button', { name: 'Mudar profissional: Joana' })).toBeTruthy()
    coachTap('Seguinte')
    expect(screen.getByRole('heading', { name: 'Valor e pagamento' })).toBeTruthy()
    coachTap('Seguinte')                                                             // keeps the habitual value
    expect(screen.queryByLabelText('Valor')).toBeNull()
    coachTap('Seguinte')
    expect(screen.getByRole('button', { name: 'Transferência' }).getAttribute('aria-pressed')).toBe('true')
    coachTap('Anterior')
    expect(where(router)).toBe(`${GUIDE}?passo=4`)
    expect(screen.getByRole('button', { name: 'Transferência' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('back, the app bar, leaving and restarting', () => {
  async function toStep(n: number) {
    const view = mount()
    start()
    for (let i = 1; i < n; i++) coachTap('Seguinte')
    return view
  }
  it('Android back goes one step back — and from the first step returns to the topic; forward returns', async () => {
    const { router } = await toStep(5)
    await back(router); expect(within(coach()).getByText('Passo 4 de 6')).toBeTruthy()
    await back(router); expect(within(coach()).getByText('Passo 3 de 6')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy()                // back to «Toque em Editar»
    await back(router); expect(within(coach()).getByText('Passo 2 de 6')).toBeTruthy()
    await back(router); expect(within(coach()).getByText('Passo 1 de 6')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Joana/ }).getAttribute('aria-current')).toBe('true')
    await back(router, 2)
    expect(within(coach()).getByText('Passo 3 de 6')).toBeTruthy()                  // forward: data intact
    await back(router, -2)
    await back(router)
    expect(where(router)).toBe(TOPIC)
  })
  it('the app\'s own ← returns a screen; × on the first screen leaves the demonstration', async () => {
    const { router } = await toStep(5)
    tap('Voltar')
    expect(await screen.findByRole('heading', { name: 'Que serviço?' })).toBeTruthy()
    tap('Mudar profissional: Joana')
    expect(await screen.findByRole('heading', { name: 'Quem fez o serviço?' })).toBeTruthy()
    tap('Fechar')
    await screen.findByRole('link', { name: /Tutorial interativo/ })
    expect(where(router)).toBe(TOPIC)
  })
  it('«Sair» from any step returns to the topic, without asking', async () => {
    const { router } = await toStep(4)
    tap('Editar')
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '5000' } })   // a typed value: still nothing to lose
    coachTap('Sair')
    await screen.findByRole('link', { name: /Tutorial interativo/ })
    expect(where(router)).toBe(TOPIC)
    expect(screen.queryByText(/Descartar/)).toBeNull()
  })
  it('«Recomeçar» starts again at step 1 with nothing chosen', async () => {
    const { router } = await toStep(5)
    coachTap('Recomeçar')
    await screen.findByText('Passo 1 de 6')
    expect(where(router)).toBe(GUIDE)
    expect(screen.getByRole('button', { name: /Joana/ }).getAttribute('aria-current')).toBeNull()
    coachTap('Seguinte')
    expect(screen.getByText('Frequentes de Joana')).toBeTruthy()
  })
  it('«Ver outra vez» on the closing screen, and «Registar outro serviço» on the success screen, restart too', async () => {
    await toStep(6)
    tap('Registar outro serviço')
    await screen.findByText('Passo 1 de 6')
    for (let i = 1; i < 6; i++) coachTap('Seguinte')
    coachTap('Terminar')
    expect(screen.getByRole('heading', { name: 'Demonstração terminada' })).toBeTruthy()
    tap('Ver outra vez')
    await screen.findByText('Passo 1 de 6')
  })
  it('on the simulated success, «Voltar a Hoje» ends the demonstration and returns to the Help topic — never to Hoje', async () => {
    const { router } = mount(['/', TOPIC, GUIDE])
    start()
    for (let i = 1; i < 6; i++) coachTap('Seguinte')
    tap('Voltar a Hoje')
    await screen.findByRole('link', { name: /Tutorial interativo/ })
    expect(where(router)).toBe(TOPIC)
    await back(router)
    expect(where(router)).toBe('/')                                                  // the guide's entries are unwound
  })
  it('«Corrigir este registo» only explains that corrections are outside the demonstration: it opens and changes nothing', () => {
    const { router } = mount()
    start()
    for (let i = 1; i < 6; i++) coachTap('Seguinte')
    tap('Corrigir este registo')
    expect(where(router)).toBe(`${GUIDE}?passo=6`)                                  // still on the simulated success
    const note = within(coach()).getByRole('status')
    expect(note.textContent).toBe('Na app, «Corrigir este registo» abre a anulação deste registo, com motivo e PIN. Não faz parte desta demonstração: veja o tema «Anular um registo errado» na Ajuda.')
    expect(screen.queryByText(/Anular este registo\?/)).toBeNull()                    // the real cancellation never opens
    coachTap('Anterior')
    expect(within(coach()).queryByRole('status')).toBeNull()                          // the note belongs to the success screen
    coachTap('Seguinte')
    expect(within(coach()).queryByRole('status')).toBeNull()                          // a new confirmation: no stale note
  })
  it('a direct link (no app history): a later step opens the intro; leaving replaces with the topic', async () => {
    const { router } = mount([`${GUIDE}?passo=4`], 0)
    expect(screen.getByRole('heading', { name: 'Como registar um serviço' })).toBeTruthy()
    expect(where(router)).toBe(GUIDE)
    start()
    coachTap('Sair')
    await screen.findByRole('link', { name: /Tutorial interativo/ })
    expect(where(router)).toBe(TOPIC)
    expect(router.state.historyAction).toBe('REPLACE')
  })
  it('never «Descartar?» and never the browser\'s leave-page question', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const { router } = await toStep(5)
    tap('Misto')
    fireEvent.change(screen.getByLabelText('Numerário'), { target: { value: '1000' } })
    await back(router, -4)
    await back(router)
    expect(where(router)).toBe(TOPIC)
    expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(false)
    expect(screen.queryByText(/Descartar/)).toBeNull()
    add.mockRestore()
  })
})

describe('true to the app', () => {
  it('Misto: the app\'s own sum sentence; Confirmar and «Seguinte» wait until the split adds up', () => {
    mount()
    start()
    for (let i = 1; i < 4; i++) coachTap('Seguinte')
    tap('Misto')
    expect(within(coach()).getByText('Passo 5 de 6')).toBeTruthy()
    const confirm = screen.getByRole('button', { name: 'Confirmar serviço' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    expect((within(coach()).getByRole('button', { name: 'Seguinte' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Numerário'), { target: { value: '2000' } })
    fireEvent.change(screen.getByLabelText('Transferência'), { target: { value: '1000' } })
    expect(screen.getByTestId('mixed-sentence').textContent).toBe('Soma 3.000 Kz. Faltam 500 Kz para chegar aos 3.500 Kz.')
    fireEvent.change(screen.getByLabelText('Transferência'), { target: { value: '1500' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    expect(screen.getByText('Corte · Joana · Misto')).toBeTruthy()
  })
  it('the value field: a different value is noted, zero is warned — as in the app', () => {
    mount()
    start()
    for (let i = 1; i < 3; i++) coachTap('Seguinte')
    tap('Editar')
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '4000' } })
    expect(screen.getByText('Valor diferente do habitual. Fica registado no histórico.')).toBeTruthy()
    expect(screen.getByText('Corte · Joana · 4.000 Kz')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '0' } })
    expect(screen.getByText('Valor zero. Confirme que este serviço não foi cobrado.')).toBeTruthy()
  })
  it('without a connection, the simulated outcome is «Guardado neste telemóvel» — never «registado»', () => {
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    mount()
    start()
    for (let i = 1; i < 6; i++) coachTap('Seguinte')
    const saved = screen.getByTestId('saved-on-device')
    expect(saved.textContent).toContain('Guardado neste telemóvel')
    expect(saved.textContent).toContain('Será enviado quando houver ligação.')
    online.mockRestore()
  })
  it('in euros: the euro example prices, formatted by the app', () => {
    mount(undefined, undefined, eur)
    start()
    coachTap('Seguinte')
    expect(target()?.textContent).toContain('15 €')
    expect(document.body.textContent).not.toMatch(/Kz/)
  })
})

describe('accessible guidance', () => {
  it('the instruction names the control, is announced, and describes the highlighted control', () => {
    mount()
    start()
    const text = within(coach()).getByText((_, el) => el?.classList.contains('guide-coach-text') ?? false)
    expect(text.getAttribute('aria-live')).toBe('polite')
    expect(text.textContent).toBe('Toque em Joana. Quem fez o serviço é sempre o primeiro passo. Não precisa de PIN nem de conta.')
    expect(target()!.getAttribute('aria-describedby')).toBe(text.id)
    coachTap('Seguinte')
    expect(document.querySelectorAll('[data-guide-target]')).toHaveLength(1)        // exactly one control at a time
    expect(document.querySelectorAll('[aria-describedby]')).toHaveLength(1)
  })
  // reduced motion (no highlight pulse, no coach entrance) is checked on the built CSS: tests/pwa/build.test.ts
})

describe('isolation', () => {
  let idbOpen: ReturnType<typeof vi.fn>
  let getItem: ReturnType<typeof vi.spyOn>, setItem: ReturnType<typeof vi.spyOn>, removeItem: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    idbOpen = vi.fn(); vi.stubGlobal('indexedDB', { open: idbOpen })
    getItem = vi.spyOn(Storage.prototype, 'getItem'); setItem = vi.spyOn(Storage.prototype, 'setItem'); removeItem = vi.spyOn(Storage.prototype, 'removeItem')
  })
  afterEach(() => { vi.unstubAllGlobals(); getItem.mockRestore(); setItem.mockRestore(); removeItem.mockRestore() })
  it('the whole journey, Misto, back and leaving: no server, no operational module, no IndexedDB, no storage', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { router } = mount()
    start()
    for (let i = 1; i < 4; i++) coachTap('Seguinte')
    tap('Misto')
    fireEvent.change(screen.getByLabelText('Numerário'), { target: { value: '2000' } })
    fireEvent.change(screen.getByLabelText('Transferência'), { target: { value: '1500' } })
    tap('Confirmar serviço')
    tap('Corrigir este registo')
    coachTap('Terminar')
    await back(router)
    tap('Voltar a Hoje')
    await screen.findByRole('link', { name: /Tutorial interativo/ })
    expect(getSupabase).not.toHaveBeenCalled()
    for (const fn of ['recordService', 'submitQueuedService', 'listCapturePeople', 'listFrequentServices', 'listPaymentMethods'] as const) {
      expect(vi.mocked(servicesApi[fn]), fn).not.toHaveBeenCalled()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(idbOpen).not.toHaveBeenCalled()
    const keys = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => c[0]).filter((k) => k !== 'remix-router-transitions')
    expect(keys(getItem)).toEqual([])                       // React Router's own view-transition key aside
    expect(keys(setItem)).toEqual([])
    expect(keys(removeItem)).toEqual([])
    fetchSpy.mockRestore()
  })
  it('every module it loads at runtime, transitively, is a verified pure or presentational one', () => {
    const files = import.meta.glob(['../../../**/*.ts', '../../../**/*.tsx', '!../../../**/*.test.ts', '!../../../**/*.test.tsx'],
      { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const norm = (p: string) => {
      const out: string[] = []
      for (const part of p.split('/')) { if (part === '..' && out.length && out[out.length - 1] !== '..') out.pop(); else if (part !== '.') out.push(part) }
      return out[0] === '..' ? out.join('/') : `./${out.join('/')}`                   // glob keys: ./same-folder, ../elsewhere
    }
    const resolve = (from: string, spec: string) => {
      const base = norm(from.replace(/[^/]+$/, '') + spec)
      return [`${base}.ts`, `${base}.tsx`].find((f) => f in files)
    }
    const seen = new Set<string>(), packages = new Set<string>()
    const walk = (file: string) => {
      if (seen.has(file)) return
      seen.add(file)
      const src = files[file]!
      for (const [, spec] of src.matchAll(/^(?:import|export) (?!type )[^'\n]*?from '([^']+)'|^import '([^']+)'/gm)) {
        if (!spec) continue
        if (!spec.startsWith('.')) { packages.add(spec); continue }
        const next = resolve(file, spec)
        expect(next, `${file} → ${spec}`).toBeTruthy()
        walk(next!)
      }
    }
    walk('./ServiceGuide.tsx')
    const fromSrc = (key: string) => {                                              // a glob key, as a path under src/
      const parts = ['spaces', 'ajuda', 'guia']
      for (const part of key.split('/')) { if (part === '..') parts.pop(); else if (part !== '.') parts.push(part) }
      return parts.join('/')
    }
    const reached = [...seen].map(fromSrc).sort()
    expect(reached, JSON.stringify(reached)).toEqual([
      'modules/org/OrganizationContext.tsx',
      'shared/money.ts', 'shared/offline/connectivity.ts', 'shared/payment.ts', 'shared/time.ts',
      'shared/ui/AmountField.tsx', 'shared/ui/AppShell.tsx', 'shared/ui/Field.tsx', 'shared/ui/Icon.tsx', 'shared/ui/ListRow.tsx',
      'shared/ui/PaymentFields.tsx', 'shared/ui/SegmentedControl.tsx', 'shared/ui/navigation.ts',
      'spaces/ajuda/guia/ServiceGuide.tsx', 'spaces/ajuda/guia/data.ts',
      'spaces/servicos/RecordServiceViews.tsx',
    ].sort())
    expect([...packages].sort()).toEqual(['react', 'react-router'])
    for (const f of seen) expect(files[f], f).not.toMatch(/getSupabase|indexedDB|localStorage|sessionStorage|navigator\.storage|fetch\(|useQuery|useMutation/)
  })
})
