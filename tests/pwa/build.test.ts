// @vitest-environment node
// Offline 5 · the build writes the static-shell service worker with this build's shell, versioned by its content.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { build } from 'vite'
import { shellManifest, writeServiceWorker } from '../../pwa/serviceWorkerPlugin'

const root = resolve(import.meta.dirname, '../..')
const precacheOf = (sw: string) => JSON.parse(/const PRECACHE = \/\*\* @type \{string\[\]\} \*\/ \((\[.*?\])\)/.exec(sw)![1]!) as string[]

describe('production build', () => {
  let out: string
  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'beauty-os-build-'))
    await build({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'silent', build: { outDir: out, emptyOutDir: true } })
  }, 120_000)
  afterAll(() => rmSync(out, { recursive: true, force: true }))

  it('writes sw.js precaching the entry HTML, its JS and CSS, the manifest and the icons', () => {
    expect(existsSync(join(out, 'sw.js'))).toBe(true)
    const sw = readFileSync(join(out, 'sw.js'), 'utf8')
    const urls = precacheOf(sw)
    const html = readFileSync(join(out, 'index.html'), 'utf8')
    const entryJs = /src="(\/assets\/[^"]+\.js)"/.exec(html)![1]!, entryCss = /href="(\/assets\/[^"]+\.css)"/.exec(html)![1]!
    expect(urls).toEqual(expect.arrayContaining(['/', entryJs, entryCss, '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']))
    expect(urls).not.toContain('/sw.js')
    expect(urls).not.toContain('/index.html')                                      // the shell is "/", as the server serves it
    expect(urls.every((u) => u.startsWith('/') && !u.includes('://'))).toBe(true)    // same origin only
    expect(sw).not.toMatch(/__BEAUTY_OS_/)
    expect(sw).toMatch(/const VERSION = "[0-9a-f]{16}"/)
  })
  it('the Brand Splash ships inside the precached shell ("/"), before the app root, with nothing to fetch', () => {
    const html = readFileSync(join(out, 'index.html'), 'utf8')
    expect(html).toContain('<div id="boot-brand" aria-hidden="true">')
    expect(html.indexOf('id="boot-brand"')).toBeLessThan(html.indexOf('id="root"'))
    expect(html).toContain('class="bb-plane bb-p2" fill="#7657D6"')
    expect(precacheOf(readFileSync(join(out, 'sw.js'), 'utf8'))).toContain('/')
    expect(existsSync(join(out, 'sollelio-brand-assets'))).toBe(false)              // the package is a source, never shipped
  })
  it('Ajuda (L2) is its own chunk, kept out of the entry and precached with the shell, so it opens offline', () => {
    const html = readFileSync(join(out, 'index.html'), 'utf8')
    const entryJs = /src="(\/assets\/[^"]+\.js)"/.exec(html)![1]!
    const urls = precacheOf(readFileSync(join(out, 'sw.js'), 'utf8'))
    const chunks = urls.filter((u) => /^\/assets\/HelpPages-[\w-]+\.js$/.test(u))
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).not.toBe(entryJs)
    const help = readFileSync(join(out, chunks[0]!), 'utf8')
    expect(help).toContain('Trabalhar sem ligação')
    expect(readFileSync(join(out, entryJs), 'utf8')).not.toContain('Trabalhar sem ligação')   // the content stays in the help chunk
    expect(urls.some((u) => /^\/assets\/HelpPages-[\w-]+\.css$/.test(u))).toBe(true)
  })
})

describe('shell manifest', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'beauty-os-shell-'))
    mkdirSync(join(dir, 'assets')); mkdirSync(join(dir, 'icons'))
    writeFileSync(join(dir, 'index.html'), '<html></html>')
    writeFileSync(join(dir, 'assets/index-abc.js'), 'js')
    writeFileSync(join(dir, 'assets/index-def.css'), 'css')
    writeFileSync(join(dir, 'icons/icon-192.png'), 'png')
    writeFileSync(join(dir, 'stats.json'), '{}')                                   // not a shell file
    writeFileSync(join(dir, 'sw.js'), 'old')
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('lists only shell files, with "/" for index.html, and versions them by content', () => {
    const a = shellManifest(dir)
    expect(a.urls).toEqual(['/assets/index-abc.js', '/assets/index-def.css', '/icons/icon-192.png', '/'])
    expect(shellManifest(dir).version).toBe(a.version)
    writeFileSync(join(dir, 'assets/index-abc.js'), 'js2')
    expect(shellManifest(dir).version).not.toBe(a.version)
  })
  it('writes the worker with the placeholders filled; without index.html there is no shell', () => {
    const m = writeServiceWorker(dir)
    const sw = readFileSync(join(dir, 'sw.js'), 'utf8')
    expect(precacheOf(sw)).toEqual(m.urls)
    expect(sw).toContain(`const VERSION = "${m.version}"`)
    rmSync(join(dir, 'index.html'))
    expect(() => writeServiceWorker(dir)).toThrow(/index\.html/)
  })
})
