// PWA installability (platform slice): the installed identity, its icons and metadata — and the absence of anything that
// could cache or serve data offline (no service worker in this slice: nothing is cached, the app needs the network).
// Icons and favicons are the Sollelio Beauty OS brand package v0.1 (Precision Violet; manifest-colours.json): the dark
// app icon as supplied (192/512), and for maskable / Apple the same artwork full-bleed (public/icons/icon-maskable.svg).
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
  it('theme Midnight Indigo and background Warm Off-white, as the brand package says, and index.html too', () => {
    expect(manifest.theme_color).toBe('#11152D')
    expect(manifest.background_color).toBe('#F7F4EE')
    expect(html).toContain('<meta name="theme-color" content="#11152D" />')
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
  it('links the manifest, the favicons and the Apple touch icon (each file present), with the mobile app metas', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="32x32 64x64" />')
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />')
    expect(html).toContain('<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />')
    expect(html).toContain('<link rel="icon" href="/favicon-64.png" type="image/png" sizes="64x64" />')
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />')
    expect(pngSize(pub('icons/apple-touch-icon.png'))).toBe('180x180')
    expect(pngSize(pub('favicon-32.png'))).toBe('32x32')
    expect(pngSize(pub('favicon-64.png'))).toBe('64x64')
    for (const f of ['favicon.ico', 'favicon.svg']) expect(existsSync(pub(f)), f).toBe(true)
    for (const m of ['mobile-web-app-capable', 'apple-mobile-web-app-capable']) expect(html).toContain(`<meta name="${m}" content="yes" />`)
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Beauty OS" />')
    expect(html).toContain('viewport-fit=cover')                                  // safe areas: the shell pads with env(safe-area-inset-*)
  })
  it('the Beauty OS artwork: the unchanged Sollelio symbol with the Beauty OS accent plane; no masterbrand placeholder left', () => {
    const paths = (svg: string) => (svg.match(/ d="[^"]+"/g) ?? [])
    const master = readFileSync(join(root, 'sollelio-brand-assets/sollelio-symbol-color.svg'), 'utf8')
    const favicon = readFileSync(pub('favicon.svg'), 'utf8')
    const maskable = readFileSync(pub('icons/icon-maskable.svg'), 'utf8')
    expect(paths(favicon)).toEqual(paths(master))                                   // the symbol is never redrawn
    expect(paths(maskable)).toEqual(paths(master))
    expect(favicon).toContain('#7657D6')                                             // Precision Violet
    expect(maskable).toContain('#9A7CF0')                                            // violet on dark
    expect(maskable).toContain('<rect width="1024" height="1024" fill="#11152D"/>')  // full bleed: the platform masks it
    expect(existsSync(pub('icons/icon.svg'))).toBe(false)
    for (const f of walk(join(root, 'public')).filter((p) => p.endsWith('.svg') || p.endsWith('.webmanifest'))) {
      expect(readFileSync(f, 'utf8'), f).not.toContain('#2457F5')                  // the masterbrand accent (the temporary icon)
    }
  })
  it('regular icons are the dark tile as supplied (rounded, transparent corners); maskable and Apple are opaque edge to edge', () => {
    const corner = (p: string) => { const b = readFileSync(p); return b.readUInt8(25) }   // PNG colour type: 6 = RGBA, 2 = RGB
    expect(corner(pub('icons/icon-192.png'))).toBe(6)
    expect(corner(pub('icons/icon-512.png'))).toBe(6)
    for (const f of ['icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png']) expect(corner(pub(f)), f).toBe(2)
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
