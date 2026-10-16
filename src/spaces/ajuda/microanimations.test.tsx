// Learning experience L3 · educational microanimations: only on the three topics that have one, started only by the
// person, played once, replayable, static under reduced motion, readable by screen readers, true to the app, synthetic,
// in the organization's currency, and isolated from the server and the device's storage.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../shared/supabase/client', () => ({
  getSupabase: vi.fn(() => { throw new Error('the help must not use Supabase') }),
  authStorageKey: vi.fn(() => { throw new Error('the help must not read the session') }),
}))
import { getSupabase } from '../../shared/supabase/client'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import { checkPayment } from '../../shared/payment'
import { HelpTopicPage } from './HelpPages'
import { TOPICS } from './topics'

const kz = { id: 'o', name: 'Exemplo', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const eur = { ...kz, currency_code: 'EUR', currency_symbol: '€' }

function open(tema: string, org: typeof kz | null = kz) {
  const router = createMemoryRouter([{ path: '/ajuda/:tema', element: <HelpTopicPage /> }], { initialEntries: [`/ajuda/${tema}`] })
  return render(<OrganizationContext.Provider value={org}><RouterProvider router={router} /></OrganizationContext.Provider>)
}
const stage = () => document.querySelector('.microanim-stage') as HTMLElement | null
const frames = () => within(screen.getByRole('list', { name: /passo a passo$/ })).getAllByRole('listitem').map((li) => li.textContent ?? '')
const reducedMotion = (on: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q === '(prefers-reduced-motion: reduce)', addEventListener: () => {}, removeEventListener: () => {} }))

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('availability', () => {
  it('exactly three topics have an animation: Registar um serviço (Misto), Stock, Trabalhar sem ligação', () => {
    expect(TOPICS.filter((t) => t.animation).map((t) => [t.id, t.animation])).toEqual([['registar-servico', 'misto'], ['stock', 'stock'], ['sem-ligacao', 'offline']])
  })
  it('the «Animação» block appears on those three topics only; the interactive tutorial nowhere yet', () => {
    for (const t of TOPICS) {
      const { unmount } = open(t.id)
      expect(screen.queryAllByText(/^Animação ·/).length, t.id).toBe(t.animation ? 1 : 0)
      expect(screen.queryByText(/Tutorial/), t.id).toBeNull()
      unmount()
    }
  })
})

describe('playing', () => {
  it('never starts by itself; «Ver» plays it once; «Ver outra vez» replays it from the start', () => {
    vi.useFakeTimers()
    open('stock')
    expect(stage()!.classList.contains('is-playing')).toBe(false)                    // no autoplay
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(stage()!.classList.contains('is-playing')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    const first = stage()!
    expect(first.classList.contains('is-playing')).toBe(true)
    expect((screen.getByRole('button', { name: 'A mostrar…' }) as HTMLButtonElement).disabled).toBe(true)
    act(() => { vi.advanceTimersByTime(3600) })
    const again = screen.getByRole('button', { name: 'Ver outra vez' })
    expect(stage()).toBe(first)                                                      // it stays on its final frame
    fireEvent.click(again)
    expect(stage()).not.toBe(first)                                                  // a fresh stage: the animation restarts
    expect(stage()!.classList.contains('is-playing')).toBe(true)
  })
  it('its stage CSS has no infinite animation and runs only under .is-playing', () => {
    const css = Object.values(import.meta.glob('./microanimations.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0]!
    expect(css).not.toMatch(/infinite|animation-iteration-count/)
    for (const rule of css.match(/[^{}]+\{[^}]*\banimation:[^}]*\}/g) ?? []) {
      if (/@keyframes|prefers-reduced-motion|none !important/.test(rule)) continue
      expect(rule.trim(), rule).toMatch(/^\.is-playing /)
    }
  })
})

describe('reduced motion and accessibility', () => {
  it('reduced motion: no stage and no button — the same three steps as still text', () => {
    reducedMotion(true)
    open('sem-ligacao')
    expect(stage()).toBeNull()
    expect(screen.queryByRole('button', { name: /^Ver/ })).toBeNull()
    expect(frames()).toHaveLength(3)
    expect(screen.getByRole('list', { name: /passo a passo$/ }).className).toBe('microanim-frames')   // visible
  })
  it('with motion: the stage is decorative and the same steps stay available to screen readers', () => {
    reducedMotion(false)
    open('sem-ligacao')
    expect(stage()!.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('list', { name: 'O que acontece sem ligação, passo a passo' }).className).toBe('sr-only')
    expect(frames()).toHaveLength(3)
    const play = screen.getByRole('button', { name: 'Ver' })
    expect(play.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.getElementById(play.getAttribute('aria-describedby')!)!.textContent).toBe('O que acontece sem ligação')
  })
})

describe('true to the app', () => {
  it('Misto: only with exactly two payment methods; the values must add up — in the app\'s own words and the salon\'s currency', () => {
    open('registar-servico', kz)
    const text = frames().join(' ')
    expect(text).toMatch(/Só aparece quando o salão usa exatamente duas formas de pagamento/)
    const c = { currency_exponent: 2, currency_symbol: 'Kz' }
    expect(text).toContain(checkPayment(350000, 'mixed', [200000, 100000], c).sentence!)          // the app's sentence
    expect(text).toContain('Soma 3.000 Kz. Faltam 500 Kz para chegar aos 3.500 Kz.')
    expect(text).toContain('Soma 3.500 Kz. Pronto para confirmar.')
    expect(text).toMatch(/«Confirmar serviço» continua desativado[\s\S]*Só então «Confirmar serviço» fica ativo/)
  })
  it('Misto in euros: the euro example (35 = 20 + 15), formatted and checked by the app — no currency hard-coded', () => {
    open('registar-servico', eur)
    const text = frames().join(' ')
    const c = { currency_exponent: 2, currency_symbol: '€' }
    expect(text).toContain(checkPayment(3500, 'mixed', [2000, 1000], c).sentence!)
    expect(text).toContain('Exemplo: 20 € numa forma e 10 € na outra. A app diz: Soma 30 €. Faltam 5 € para chegar aos 35 €.')
    expect(text).toContain('Com 15 € na segunda forma, a app diz: Soma 35 €. Pronto para confirmar.')
    const shown = stage()!.textContent!
    expect(shown).toContain('35 €')
    expect(shown).toMatch(/20 €[\s\S]*10 €[\s\S]*15 €/)
    expect(text + shown).not.toMatch(/Kz|AOA|3\.500|2\.000|1\.500/)
  })
  it('Kz keeps its example (3.500 = 2.000 + 1.500) in the stage too', () => {
    open('registar-servico', kz)
    expect(stage()!.textContent).toMatch(/3\.500 Kz[\s\S]*2\.000 Kz[\s\S]*1\.000 Kz[\s\S]*1\.500 Kz/)
  })
  it('every example tells the same story: the short split is short, the corrected split balances exactly', async () => {
    const source = Object.values(import.meta.glob('./demos.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0]!
    const rows = [...source.matchAll(/(\w{3}): \{ total: (\d+), first: (\d+), short: (\d+), second: (\d+) \}/g)].map((m) => [m[1], ...m.slice(2).map(Number)] as [string, number, number, number, number])
    expect(rows.map((r) => r[0])).toEqual(['AOA', 'EUR'])
    for (const [code, total, first, short, second] of rows) {
      expect(first + short, code).toBeLessThan(total)
      expect(first + second, code).toBe(total)
      expect(short, code).toBeLessThan(second)
    }
  })
  it('a currency without its own example (USD): a still explanation of Misto, without amounts — no conversion, no other example', () => {
    for (const reduced of [false, true]) {
      reducedMotion(reduced)
      const { unmount } = open('registar-servico', { ...kz, currency_code: 'USD', currency_symbol: 'US$' })
      expect(stage()).toBeNull()                                                     // nothing to play
      expect(screen.queryByRole('button', { name: /^Ver/ })).toBeNull()
      expect(screen.queryByText(/^Animação ·/)).toBeNull()
      expect(screen.getByText('Explicação · funciona sem ligação')).toBeTruthy()
      const list = screen.getByRole('list', { name: 'Misto: dividir o valor, passo a passo' })
      expect(list.className).toBe('microanim-frames')                               // visible to everyone
      const text = frames().join(' ')
      expect(frames()).toHaveLength(3)
      expect(text).toMatch(/Só aparece quando o salão usa exatamente duas formas de pagamento/)
      expect(text).toMatch(/«Confirmar serviço» continua desativado[\s\S]*Só então «Confirmar serviço» fica ativo/)
      const steps = [...list.querySelectorAll('li > span:last-child')].map((e) => e.textContent).join(' ')   // without the step numbers
      expect(steps).not.toMatch(/\d|US\$|Kz|€/)                                      // no amounts, no currency
      unmount()
    }
  })
  it('Stock: the product sheet, the state, «Guardar» online — and no purchase is recorded', () => {
    open('stock')
    const text = frames().join(' ')
    expect(text).toMatch(/Abre-se a folha do produto/)
    expect(text).toMatch(/OK, Baixo ou Comprar\. Guardar precisa de ligação/)
    expect(text).toMatch(/Não regista nenhuma compra: a compra regista-se depois, em «Registar compra»/)
    expect(stage()!.textContent).toContain('Guardar')
  })
  it('Sem ligação: nothing registered until sent while open and connected, possibly «Para rever»; drafts wait for the PIN', () => {
    open('sem-ligacao')
    const text = frames().join(' ')
    expect(text).toMatch(/«Guardado neste telemóvel» — ainda não está registado/)
    expect(text).toMatch(/Com o Beauty OS aberto e com ligação/)
    expect(text).toMatch(/Se o servidor não aceitar um, fica em «Para rever»/)
    expect(text).toMatch(/Não seguem sozinhos: só passam a registo quando alguém os confirma com o PIN, com ligação/)
    expect(text + stage()!.textContent).not.toMatch(/sempre|garantid|automaticamente|seguem sozinhos(?!:)/i)
  })
  it('every UI label the animations quote («…») exists in the app as written; no hard-coded currency or tenant', () => {
    const demos = Object.values(import.meta.glob('./demos.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0]!
    const app = Object.entries(import.meta.glob(['../../**/*.ts', '../../**/*.tsx', '!../../**/*.test.ts', '!../../**/*.test.tsx', '!./**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
      .map(([, t]) => t).join('\n')
    const quoted = [...new Set([...demos.matchAll(/«([^»]+)»/g)].map((m) => m[1]!))]
    expect(quoted.length).toBeGreaterThanOrEqual(8)
    expect(quoted.filter((q) => !app.includes(q))).toEqual([])
    // currency codes appear only as keys of the per-currency example table; symbols never (they come from the org)
    const table = /const MISTO_EXAMPLES[^}]*\{[\s\S]*?\n\}/.exec(demos)![0]
    expect(demos.replace(table, '')).not.toMatch(/Kz|AOA|EUR|€|Salão|Agradável/)
    expect(table).not.toMatch(/Kz|€/)
  })
})

describe('isolation', () => {
  let idbOpen: ReturnType<typeof vi.fn>
  let getItem: ReturnType<typeof vi.spyOn>, setItem: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    idbOpen = vi.fn(); vi.stubGlobal('indexedDB', { open: idbOpen })
    getItem = vi.spyOn(Storage.prototype, 'getItem'); setItem = vi.spyOn(Storage.prototype, 'setItem')
  })
  afterEach(() => { getItem.mockRestore(); setItem.mockRestore() })
  it('playing all three touches no server, no IndexedDB and no storage', () => {
    vi.useFakeTimers()
    for (const t of ['registar-servico', 'stock', 'sem-ligacao']) {
      const { unmount } = open(t)
      fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
      act(() => { vi.advanceTimersByTime(4000) })
      fireEvent.click(screen.getByRole('button', { name: 'Ver outra vez' }))
      unmount()
    }
    const keys = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => c[0]).filter((k) => k !== 'remix-router-transitions')
    expect(getSupabase).not.toHaveBeenCalled()
    expect(idbOpen).not.toHaveBeenCalled()
    expect(keys(getItem)).toEqual([])
    expect(keys(setItem)).toEqual([])
  })
})
