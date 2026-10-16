// Learning experience L2 · Ajuda: written help, public on an enrolled device, the same for every salon, isolated from
// operational data, true to the implementation.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type InitialEntry } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Isolation: the help must never reach the server, device storage or any operational module.
vi.mock('../../shared/supabase/client', () => ({
  getSupabase: vi.fn(() => { throw new Error('the help must not use Supabase') }),
  authStorageKey: vi.fn(() => { throw new Error('the help must not read the session') }),
}))
import { getSupabase } from '../../shared/supabase/client'
import { HelpHome, HelpStepsPage, HelpTopicPage } from './HelpPages'
import { HelpLayout, HelpLoadError } from './lazy'
import { findTopic, searchTopics, TOPICS } from './topics'
import { router as appRouter } from '../../app/router'

function mount(entries: InitialEntry[], index?: number) {
  const router = createMemoryRouter([
    { path: '/', element: <p>Ecrã Hoje</p> },
    { path: '/ajuda', element: <HelpHome /> },
    { path: '/ajuda/:tema', element: <HelpTopicPage /> },
    { path: '/ajuda/:tema/passos', element: <HelpStepsPage /> },
  ], { initialEntries: entries, initialIndex: index })
  // deliberately no QueryClientProvider and no organization: the help needs neither
  return { router, ...render(<RouterProvider router={router} />) }
}
const back = () => fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
const allText = TOPICS.map((t) => [t.title, t.summary, ...t.steps, t.tip ?? ''].join(' ')).join(' ')

describe('Ajuda · access', () => {
  it('lives under DeviceGate in the real router: no help before the device is enrolled', () => {
    const root = appRouter.routes[0]!
    const gate = root.children!.find((r) => !r.path && r.children?.some((c) => c.path === 'servicos/registar'))!
    expect(gate.children!.some((c) => c.path === 'ajuda')).toBe(true)
    expect(root.children!.some((c) => c.path === 'ajuda')).toBe(false)              // never beside the gate
    const ajuda = gate.children!.find((c) => c.path === 'ajuda')!
    expect(ajuda.children!.map((c) => c.index ? 'index' : c.path)).toEqual(['index', ':tema', ':tema/passos'])
    expect(ajuda.errorElement).toBeTruthy()                                         // a failed help load stays in the app
    const privado = gate.children!.find((c) => c.path === 'privado')!
    expect(privado.children!.some((c) => c.path?.startsWith('ajuda'))).toBe(false)  // public, never inside the private area
  })
})

describe('Ajuda · home and topics', () => {
  it('lists the 12 topics in three groups, the private ones with their notice, and says it works offline', () => {
    mount(['/', '/ajuda'], 1)
    for (const [label, n] of [['Dia a dia', 6], ['Sem ligação', 1], ['Área privada · com PIN', 5]] as const) {
      const section = screen.getByRole('region', { name: label })
      expect(within(section).getAllByRole('link')).toHaveLength(n)
    }
    expect(screen.getByText(/sem dados reais. Os valores só aparecem na app, depois do PIN/)).toBeTruthy()
    expect(screen.getByText('Esta ajuda fica guardada neste telemóvel e funciona sem ligação.')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Registar um serviço/ }).getAttribute('href')).toBe('/ajuda/registar-servico')
  })
  it('a topic lists only the content that can be used today: the written steps — nothing about future animations or tutorials', () => {
    mount(['/ajuda/registar-servico'])
    expect(screen.getByRole('heading', { level: 2, name: 'Registar um serviço' })).toBeTruthy()
    const steps = screen.getByRole('link', { name: /Passo a passo/ })
    expect(steps.getAttribute('href')).toBe('/ajuda/registar-servico/passos')
    expect(steps.textContent).toContain('5 passos · funciona sem ligação')
    expect(screen.getAllByRole('link').filter((a) => a.closest('.row-group'))).toEqual([steps])
    expect(screen.queryByText(/Animação|Tutorial|Ainda não disponível|em breve/i)).toBeNull()
    expect(screen.queryByText(/pede o PIN de uma pessoa com permissão/)).toBeNull()   // not a private topic
  })
  it('a private topic says the app asks for a PIN and the help only explains', () => {
    mount(['/ajuda/fecho'])
    expect(screen.getByText(/Na app, este passo pede o PIN de uma pessoa com permissão. A ajuda explica só como funciona./)).toBeTruthy()
  })
  it('the written steps: an ordered list, the tip, and that the help shows no real data', () => {
    mount(['/ajuda/stock/passos'])
    const list = screen.getByRole('list')
    expect(list.tagName).toBe('OL')
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(findTopic('stock')!.steps.map((s, i) => `${i + 1}${s}`))
    expect(screen.getByText(findTopic('stock')!.tip!)).toBeTruthy()
    expect(screen.getByText(/não mostra dados reais/)).toBeTruthy()
  })
  it('an unknown topic (old link, typo): a clear empty state with the way back to all topics', () => {
    for (const path of ['/ajuda/nao-existe', '/ajuda/nao-existe/passos']) {
      const { unmount } = mount([path])
      expect(screen.getByText('Este tema não existe')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Ver todos os temas' }).getAttribute('href')).toBe('/ajuda')
      unmount()
    }
  })
})

describe('Ajuda · the help cannot open', () => {
  function Broken(): never { throw new TypeError('Failed to fetch dynamically imported module') }   // what React.lazy throws
  it('stays in the app with a plain message, a retry, and the way back to Hoje — never the router\'s developer screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})                     // React reports the caught error
    const router = createMemoryRouter([
      { path: '/', element: <p>Ecrã Hoje</p> },
      { path: '/ajuda', element: <HelpLayout />, errorElement: <HelpLoadError />, children: [{ path: ':tema', element: <Broken /> }] },
    ], { initialEntries: ['/ajuda/stock'] })
    render(<RouterProvider router={router} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível abrir a ajuda. Verifique a ligação e tente novamente.')
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy()
    expect(screen.queryByText(/Unexpected Application Error/)).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Voltar ao Hoje' }))
    expect(await screen.findByText('Ecrã Hoje')).toBeTruthy()
    expect(router.state.historyAction).toBe('REPLACE')
    vi.mocked(console.error).mockRestore()
  })
})

describe('Ajuda · search', () => {
  it('finds by any word, without accents, across titles and steps; back from a result returns to the same results', async () => {
    const { router } = mount(['/', '/ajuda'], 1)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Procurar na ajuda' }), { target: { value: 'servico' } })
    expect(router.state.location.search).toBe('?q=servico')
    expect(screen.getByRole('status').textContent).toMatch(/\d+ resultados?/)
    fireEvent.click(screen.getByRole('link', { name: /Registar um serviço/ }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Registar um serviço' })).toBeTruthy()
    back()
    expect((await screen.findByRole('searchbox', { name: 'Procurar na ajuda' }) as HTMLInputElement).value).toBe('servico')
    expect(screen.getByRole('link', { name: /Registar um serviço/ })).toBeTruthy()
    expect(router.state.location.search).toBe('?q=servico')
  })
  it('searches every word, and the private-area words find the generic private topics', () => {
    expect(searchTopics('pin').length).toBeGreaterThan(3)
    expect(searchTopics('lista compra').map((t) => t.id)).toContain('stock')
    expect(searchTopics('LIGAÇÃO').map((t) => t.id)).toContain('sem-ligacao')
    expect(searchTopics('   ')).toEqual([])
  })
  it('no results: says so, suggests words, and offers all topics again', () => {
    mount(['/ajuda'])
    fireEvent.change(screen.getByRole('searchbox', { name: 'Procurar na ajuda' }), { target: { value: 'xyzzy' } })
    expect(screen.getByText('Sem resultados para «xyzzy»')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver todos os temas' }))
    expect(screen.getByRole('region', { name: 'Dia a dia' })).toBeTruthy()
  })
})

describe('Ajuda · back', () => {
  it('opened in the app: back retraces Passo a passo → Tema → Ajuda → Hoje', async () => {
    const { router } = mount(['/', '/ajuda', '/ajuda/compra', '/ajuda/compra/passos'], 3)
    for (const expected of ['/ajuda/compra', '/ajuda', '/']) {
      back()
      await screen.findByText(expected === '/' ? 'Ecrã Hoje' : expected === '/ajuda' ? 'Dia a dia' : 'Registar uma compra')
      expect(router.state.location.pathname).toBe(expected)
    }
  })
  it('entered directly (a shared or saved link): back replaces with the parent, never leaving the app', async () => {
    const { router } = mount(['/ajuda/compra/passos'])
    back()
    await screen.findByRole('link', { name: /Passo a passo/ })
    expect(router.state.location.pathname).toBe('/ajuda/compra')
    expect(router.state.historyAction).toBe('REPLACE')
  })
})

describe('Ajuda · isolation and content', () => {
  let idbOpen: ReturnType<typeof vi.fn>
  let getItem: ReturnType<typeof vi.spyOn>, setItem: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    idbOpen = vi.fn()
    vi.stubGlobal('indexedDB', { open: idbOpen })
    getItem = vi.spyOn(Storage.prototype, 'getItem'); setItem = vi.spyOn(Storage.prototype, 'setItem')
  })
  afterEach(() => { vi.unstubAllGlobals(); getItem.mockRestore(); setItem.mockRestore() })

  it('rendering every screen touches no server, no IndexedDB and no localStorage', () => {
    for (const path of ['/ajuda', '/ajuda/registar-servico', '/ajuda/area-privada/passos', '/ajuda/nao-existe']) {
      const { unmount } = mount([path]); unmount()
    }
    const m = mount(['/ajuda']); fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'fecho' } }); m.unmount()
    expect(getSupabase).not.toHaveBeenCalled()
    expect(idbOpen).not.toHaveBeenCalled()
    // React Router itself (every screen, not the help) reads its own view-transition key from sessionStorage
    const keys = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => c[0]).filter((k) => k !== 'remix-router-transitions')
    expect(keys(getItem)).toEqual([])
    expect(keys(setItem)).toEqual([])
  })
  it('its code imports only React, the router, the shared UI primitives and its own content', () => {
    const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    expect(Object.keys(sources).sort()).toEqual(['./HelpPages.tsx', './lazy.tsx', './topics.ts'])
    for (const [file, text] of Object.entries(sources)) {
      for (const [, from] of text.matchAll(/from '([^']+)'/g)) {
        expect(from, file).toMatch(/^(react|react-router|\.\.\/\.\.\/shared\/ui\/[A-Za-z]+|\.\/topics|\.\/HelpPages)$/)
      }
      for (const [, dyn] of text.matchAll(/import\('([^']+)'\)/g)) {
        expect(dyn, file).toBe('./HelpPages')                                   // the lazy chunk, nothing else
      }
      expect(text, file).not.toMatch(/localStorage|sessionStorage|indexedDB|getSupabase|supabase|fetch\(|navigator\.storage|useQuery|useOrganization/)
    }
  })
  it('12 topics, unique ids, the approved groups', () => {
    expect(TOPICS).toHaveLength(12)
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(12)
    expect(TOPICS.map((t) => t.group).join(',')).toBe('daily,daily,daily,daily,daily,daily,offline,private,private,private,private,private')
  })
  it('synthetic and common to every salon: no currency, amounts, prices, names or tenant', () => {
    expect(allText).not.toMatch(/Kz|AOA|€|\$|\d[\d.,]*\s?(Kz|€)|\d{3}/)
    expect(allText).not.toMatch(/Salão|Agradável|Joana|Miguel|Rita|Tomás|Fernando|Duarte|Ana\b|Bruno|Carla/)
  })
  it('true to the offline contract and to Misto (L0 corrections)', () => {
    const t = (id: string) => [findTopic(id)!.summary, ...findTopic(id)!.steps, findTopic(id)!.tip].join(' ')
    expect(t('sem-ligacao')).toMatch(/aberto com ligação/)
    expect(t('sem-ligacao')).toMatch(/«para rever»/)
    for (const id of ['adiantamento', 'despesa', 'compra']) expect(t(id), id).toMatch(/«por confirmar com PIN»[\s\S]*(PIN, com ligação|confirmação, com ligação)/)
    expect(t('adiantamento')).toContain('Nunca segue sozinho')
    expect(allText).not.toMatch(/(enviad\w*|segue[m]?) sozinh(o|os) (depois|quando)|seguem sozinhos\b(?! os)/)
    expect(t('stock')).toMatch(/«Guardar»\. Guardar precisa de ligação/)
    expect(t('registar-servico')).toMatch(/«Misto»[^.]*só aparece quando o salão usa exatamente duas formas de pagamento/)
  })
  it('the editorial refinements stay true to the app (offline review, expense vs purchase, Fecho permissions, Gestão route)', () => {
    const t = (id: string) => [findTopic(id)!.summary, ...findTopic(id)!.steps, findTopic(id)!.tip].join(' ')
    // an offline service is not registered until the server accepts it; otherwise it goes to «Para rever»
    expect(t('registar-servico')).toMatch(/ainda não está registado[\s\S]*«Para rever» em vez de ficar registado/)
    // an expense has no products and never enters the stock; products for the services are a purchase, which records who paid
    expect(t('despesa')).toMatch(/não tem produtos e não entra no stock/)
    expect(t('despesa')).toMatch(/«Registar compra», onde também fica quem pagou/)
    // Fecho: access and each decision depend on the person's permissions — never "anyone in the private area"
    expect(t('fecho')).toMatch(/só abre a quem tem essa permissão/)
    expect(t('fecho')).toMatch(/pessoa com essa permissão: aprovar, confirmar pagamentos e fechar podem caber a pessoas diferentes/)
    expect(t('fecho')).toMatch(/Reabrir é uma permissão à parte/)
    // Gestão: the current route through Equipa, not presented as a permission rule
    expect(t('gestao')).toMatch(/Por agora, é este o caminho para a Gestão/)
    expect(t('gestao')).not.toMatch(/só (aparece|para) (a )?quem tem acesso à equipa|precisa de acesso à Equipa/i)
  })
  it('every UI label quoted in the help («…») exists in the app as written', () => {
    const app = Object.entries(import.meta.glob(['../../**/*.ts', '../../**/*.tsx', '!../../**/*.test.ts', '!../../**/*.test.tsx', '!./**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
      .map(([, text]) => text).join('\n')
    const quoted = [...new Set([...allText.matchAll(/«([^»]+)»/g)].map((m) => m[1]!))]
    expect(quoted.length).toBeGreaterThan(30)
    const missing = quoted.filter((q) => !app.includes(q))
    expect(missing).toEqual([])
  })
})

describe('Ajuda · accessibility', () => {
  it('a named search field, one heading per screen, a labelled back button', () => {
    mount(['/ajuda'])
    expect(screen.getByRole('searchbox', { name: 'Procurar na ajuda' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeTruthy()
  })
})
