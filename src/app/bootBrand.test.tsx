// Learning experience L1 · Brand Splash: presentation during real loading only. The brand painted by index.html stays
// while something holds it and leaves the moment nothing does — never on a timer, never held for a minimum.
import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { armBootBrandFailsafe, BOOT_BRAND_ID, dismissBootBrand, holdBootBrand } from './bootBrand'
import { BootBrandGate, BootPending } from './BootBrandGate'
import html from '../../index.html?raw'

function paint() {
  const el = document.createElement('div')
  el.id = BOOT_BRAND_ID
  el.appendChild(document.createElement('svg'))
  document.body.prepend(el)
  return el
}
const brand = () => document.getElementById(BOOT_BRAND_ID)
const leaving = () => brand()?.classList.contains('bb-leaving') ?? 'removed'
const flush = () => new Promise<void>((r) => queueMicrotask(r))

afterEach(() => {
  brand()?.remove()
  vi.unstubAllGlobals()
})

describe('dismissBootBrand', () => {
  it('starts the fade (CSS) and takes the element out when its own fade ends — not when a child animation ends', () => {
    const el = paint()
    dismissBootBrand()
    expect(el.classList.contains('bb-leaving')).toBe(true)
    el.firstChild!.dispatchEvent(new Event('animationend', { bubbles: true }))   // a plane finishing its reveal
    expect(brand()).toBe(el)
    el.dispatchEvent(new Event('animationend'))
    expect(brand()).toBeNull()
  })
  it('reduced motion: removed at once, no fade', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' }))
    paint()
    dismissBootBrand()
    expect(brand()).toBeNull()
  })
  it('is idempotent and harmless without the element (tests, a second call, an already removed brand)', () => {
    expect(() => dismissBootBrand()).not.toThrow()
    const el = paint()
    dismissBootBrand(); dismissBootBrand()
    expect(el.classList.contains('bb-leaving')).toBe(true)
  })
})

describe('when the brand leaves', () => {
  it('nothing loading at the first commit (e.g. an unknown route, an error screen): it leaves straight away', async () => {
    paint()
    render(<BootBrandGate><p>Página</p></BootBrandGate>)
    await flush()
    expect(leaving()).toBe(true)
  })
  it('stays while something is loading and leaves the moment the last loading state ends', async () => {
    paint()
    const view = render(<BootBrandGate><BootPending /><BootPending /></BootBrandGate>)
    await flush()
    expect(leaving()).toBe(false)
    view.rerender(<BootBrandGate><BootPending /></BootBrandGate>)
    await flush()
    expect(leaving()).toBe(false)
    view.rerender(<BootBrandGate><p>Hoje</p></BootBrandGate>)
    await flush()
    expect(leaving()).toBe(true)
  })
  it('a loading state replacing another in the same commit, or StrictMode remounting it, does not end it early', async () => {
    paint()
    const view = render(<StrictMode><BootBrandGate><BootPending key="a" /></BootBrandGate></StrictMode>)
    await flush()
    expect(leaving()).toBe(false)
    view.rerender(<StrictMode><BootBrandGate><BootPending key="b" /></BootBrandGate></StrictMode>)
    await flush()
    expect(leaving()).toBe(false)
    view.unmount()
    await flush()
    expect(leaving()).toBe(true)
  })
  it('a hold released twice counts once', async () => {
    paint()
    const a = holdBootBrand(), b = holdBootBrand()
    a(); a()
    await flush()
    expect(leaving()).toBe(false)
    b()
    await flush()
    expect(leaving()).toBe(true)
  })
  it('an uncaught error removes it even while something is loading (and the app marks the brand as started)', async () => {
    paint()
    const release = holdBootBrand()
    armBootBrandFailsafe(window)
    expect(brand()!.hasAttribute('data-app-started')).toBe(true)   // index.html's recovery now leaves errors to this
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))
    expect(leaving()).toBe(true)
    release()
  })
})

// The app could not start (its script failed to download, or it failed before main.tsx ran): the brand must not wait
// forever. index.html's own inline recovery turns it into a retry — and leaves every other error alone.
describe('Brand Splash recovery when the app cannot start', () => {
  const recovery = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)
  const overlayMarkup = /<div id="boot-brand"[\s\S]*?(?=<div id="root">)/.exec(html)![0]
  const brand = () => document.getElementById('boot-brand')!
  const failed = () => brand().classList.contains('bb-failed')
  const fresh = () => { document.body.innerHTML = overlayMarkup + '<div id="root"></div>' }
  const failingScript = (type?: string) => {
    const s = document.createElement('script')
    if (type) s.type = type
    document.head.appendChild(s)
    s.dispatchEvent(new Event('error'))                     // what the browser fires when a script cannot be fetched
    s.remove()
  }
  // one inline script, registered once (as the page does); it needs no timer
  it('is one inline script with no timer and no external source', () => {
    expect(recovery).toHaveLength(1)
    expect(recovery[0]).not.toMatch(/setTimeout|setInterval|requestAnimationFrame|fetch\(|import\(/)
    new Function(recovery[0]!)()
  })
  it('the app\'s module script fails to download: a retry, reachable and announced', () => {
    fresh()
    failingScript('module')
    expect(failed()).toBe(true)
    expect(brand().hasAttribute('aria-hidden')).toBe(false)
    expect(brand().querySelector('[role="alert"]')!.textContent).toContain('Não foi possível abrir o Beauty OS')
    expect(document.activeElement?.textContent).toBe('Tentar novamente')
    expect((brand().querySelector('.bb-error button') as HTMLButtonElement).getAttribute('onclick')).toBe('location.reload()')
  })
  it('an uncaught error before the app has started (e.g. the bundle fails while evaluating): a retry', () => {
    fresh()
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))
    expect(failed()).toBe(true)
  })
  it('leaves everything else alone: another script failing (Turnstile), errors once the app has started, a brand already leaving', () => {
    fresh()
    failingScript()                                          // a classic third-party script
    expect(failed()).toBe(false)
    brand().setAttribute('data-app-started', '')             // main.tsx has run: its own failsafe handles errors
    window.dispatchEvent(new ErrorEvent('error', { message: 'later' }))
    expect(failed()).toBe(false)
    fresh()
    brand().classList.add('bb-leaving')
    failingScript('module')
    expect(failed()).toBe(false)
  })
})
