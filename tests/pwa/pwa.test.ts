// PWA installability (platform slice): the installed identity, its icons and metadata — and the absence of anything that
// could cache or serve data offline (no service worker in this slice: nothing is cached, the app needs the network).
// Icons are temporary: the master Sollelio avatar (sollelio-brand-assets), rendered from public/icons/*.svg, until the
// Beauty OS product accent is chosen (00 §1, Open).
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

const root = resolve(import.meta.dirname, '../..')
const pub = (p: string) => join(root, 'public', p.replace(/^\//, ''))
const manifest = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf8')) as {
  id: string; name: string; short_name: string; start_url: string; scope: string; display: string
  background_color: string; theme_color: string; lang: string; icons: { src: string; sizes: string; type: string; purpose: string }[]
}
const html = readFileSync(join(root, 'index.html'), 'utf8')
/** Width × height from a PNG's IHDR chunk. */
function pngSize(path: string) {
  const b = readFileSync(path)
  expect(b.subarray(1, 4).toString('ascii')).toBe('PNG')
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`
}
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f: string) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] })
}

describe('web app manifest', () => {
  it('the product identity, never a tenant: Sollelio Beauty OS / Beauty OS', () => {
    expect(manifest.name).toBe('Sollelio Beauty OS')
    expect(manifest.short_name).toBe('Beauty OS')
    expect(JSON.stringify(manifest)).not.toMatch(/Agradável|Salão|Demo|Fecho Dev/i)
    expect(manifest.lang).toBe('pt')
  })
  it('standalone, starting at the app entry, scoped to the whole app, with no environment-specific host', () => {
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.id).toBe('/')
    expect(JSON.stringify(manifest)).not.toMatch(/https?:\/\//)
  })
  it('theme and background are the app ground (Warm Off-white), as index.html says too', () => {
    expect(manifest.theme_color).toBe('#F7F4EE')
    expect(manifest.background_color).toBe('#F7F4EE')
    expect(html).toContain('<meta name="theme-color" content="#F7F4EE" />')
  })
  it('192 and 512 icons, regular and maskable, each file present with its declared size', () => {
    const want = [['192x192', 'any'], ['512x512', 'any'], ['192x192', 'maskable'], ['512x512', 'maskable']]
    expect(manifest.icons.map((i) => [i.sizes, i.purpose])).toEqual(want)
    for (const i of manifest.icons) {
      expect(i.type).toBe('image/png')
      expect(existsSync(pub(i.src)), i.src).toBe(true)
      expect(pngSize(pub(i.src)), i.src).toBe(i.sizes)
    }
  })
})

describe('index.html install metadata', () => {
  it('links the manifest, the favicon and the Apple touch icon (each file present), with the mobile app metas', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />')
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />')
    expect(pngSize(pub('icons/apple-touch-icon.png'))).toBe('180x180')
    expect(existsSync(pub('favicon.svg'))).toBe(true)
    for (const m of ['mobile-web-app-capable', 'apple-mobile-web-app-capable']) expect(html).toContain(`<meta name="${m}" content="yes" />`)
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Beauty OS" />')
    expect(html).toContain('viewport-fit=cover')                                  // safe areas: the shell pads with env(safe-area-inset-*)
  })
  it('the icons are the approved master symbol, unchanged (not a new mark)', () => {
    const brand = readFileSync(join(root, 'sollelio-brand-assets/sollelio-symbol-color.svg'), 'utf8')
    expect(readFileSync(pub('favicon.svg'), 'utf8')).toBe(brand)
    const paths = (svg: string) => svg.match(/<path [^>]*\/>/g)
    const avatar = readFileSync(join(root, 'sollelio-brand-assets/sollelio-avatar.svg'), 'utf8')
    expect(paths(readFileSync(pub('icons/icon.svg'), 'utf8'))).toEqual(paths(avatar))
    expect(paths(readFileSync(pub('icons/icon-maskable.svg'), 'utf8'))).toEqual(paths(avatar))
  })
})

describe('no offline behaviour in this slice', () => {
  it('no service worker file, and nothing registers one or caches requests', () => {
    expect(walk(join(root, 'public')).filter((p) => /sw\.js|service-?worker|workbox/i.test(p))).toEqual([])
    const sources = walk(join(root, 'src')).filter((p) => /\.(ts|tsx)$/.test(p) && !p.endsWith('.test.ts') && !p.endsWith('.test.tsx'))
    for (const p of sources) expect(readFileSync(p, 'utf8'), p).not.toMatch(/serviceWorker|caches\.open|CacheStorage|workbox/)
    expect(html).not.toMatch(/serviceWorker/)
    const pkg = readFileSync(join(root, 'package.json'), 'utf8')
    expect(pkg).not.toMatch(/vite-plugin-pwa|workbox/)
  })
})
