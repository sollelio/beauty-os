// @vitest-environment node
// Offline 5 · the static-shell service worker (ADR-0010 §7), run in a sandbox with fake caches and fetch: what it
// precaches, what it answers, what it never touches, and its lifecycle.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderServiceWorker } from '../../pwa/serviceWorkerPlugin'

const root = resolve(import.meta.dirname, '../..')
const template = readFileSync(resolve(root, 'pwa/sw.js'), 'utf8')
const ORIGIN = 'https://beauty.test'
const URLS = ['/', '/assets/index-abc.js', '/assets/index-def.css', '/manifest.webmanifest', '/icons/icon-192.png']
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')     // without comments

type Req = { url: string; method: string; mode: string }
type Fetch = (r: Req | Request) => Promise<Response>
const page = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
const network: Fetch = async (r) => page(`network:${new URL(r.url).pathname}`)

function load({ version = 'v2', fetchImpl = network, existing = [] as string[] } = {}) {
  const listeners: Record<string, (e: unknown) => void> = {}
  const fetchSpy = vi.fn(fetchImpl)
  const store = new Map<string, Map<string, Response>>()
  for (const n of existing) store.set(n, new Map([['/', page('old shell')]]))
  const caches = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map())
      const m = store.get(name)!
      return {
        addAll: async (reqs: Request[]) => {                                       // all or nothing, like the browser
          const res = await Promise.all(reqs.map((r) => fetchSpy(r)))
          if (res.some((r) => !r.ok)) throw new TypeError('Request failed')
          reqs.forEach((r, i) => m.set(new URL(r.url).pathname, res[i]!))
        },
        match: async (u: string) => m.get(u)?.clone(),
        put: vi.fn(),
      }
    },
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
  }
  const self = {
    addEventListener: (t: string, f: (e: unknown) => void) => { listeners[t] = f },
    location: { origin: ORIGIN },
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(),
    registration: { sync: { register: vi.fn() }, periodicSync: { register: vi.fn() } },
  }
  const indexedDB = { open: vi.fn(), deleteDatabase: vi.fn() }
  class R extends Request { constructor(u: string, o?: RequestInit) { super(new URL(u, ORIGIN), o) } }
  new Function('self', 'caches', 'fetch', 'Request', 'Response', 'URL', 'setTimeout', 'clearTimeout', 'indexedDB', 'localStorage',
    renderServiceWorker(template, { urls: URLS, version }))(self, caches, fetchSpy, R, Response, URL, setTimeout, clearTimeout, indexedDB, undefined)
  const extend = async (type: string) => {
    let p: Promise<unknown> = Promise.resolve()
    listeners[type]!({ waitUntil: (x: Promise<unknown>) => { p = x } })
    return p
  }
  const request = (path: string, { mode = 'no-cors', method = 'GET', origin = ORIGIN } = {}) => {
    let responded: Promise<Response> | null = null
    listeners.fetch!({ request: { url: origin + path, method, mode } as Req, respondWith: (x: Promise<Response>) => { responded = x } })
    return responded as Promise<Response> | null
  }
  return { store, self, indexedDB, fetchSpy, install: () => extend('install'), activate: () => extend('activate'), request }
}

afterEach(() => { vi.useRealTimers() })

describe('install', () => {
  it('precaches exactly the build\'s shell list, bypassing the HTTP cache', async () => {
    const sw = load()
    await sw.install()
    expect([...sw.store.keys()]).toEqual(['beauty-os-shell-v2'])
    expect([...sw.store.get('beauty-os-shell-v2')!.keys()].sort()).toEqual([...URLS].sort())
    expect((sw.fetchSpy.mock.calls[0]![0] as Request).cache).toBe('reload')
  })
  it('a missing shell file fails the install: no new shell is claimed', async () => {
    const sw = load({ fetchImpl: async (r) => (new URL(r.url).pathname.endsWith('.css') ? new Response('', { status: 404 }) : page('x')) })
    await expect(sw.install()).rejects.toThrow()
    expect(sw.store.get('beauty-os-shell-v2')?.size ?? 0).toBe(0)
  })
  it('never skips waiting: an update takes over only when the app windows have closed', async () => {
    const sw = load()
    await sw.install()
    expect(sw.self.skipWaiting).not.toHaveBeenCalled()
  })
})

describe('activate', () => {
  it('removes only older Beauty OS shell caches; other caches and IndexedDB are untouched', async () => {
    const sw = load({ existing: ['beauty-os-shell-v1', 'some-other-cache'] })
    await sw.install()
    await sw.activate()
    expect([...sw.store.keys()].sort()).toEqual(['beauty-os-shell-v2', 'some-other-cache'])
    expect(sw.self.clients.claim).toHaveBeenCalled()
    expect(sw.indexedDB.open).not.toHaveBeenCalled()
    expect(sw.indexedDB.deleteDatabase).not.toHaveBeenCalled()
  })
})

describe('fetch', () => {
  it('online, an app navigation comes from the network', async () => {
    const sw = load()
    await sw.install()
    expect(await (await sw.request('/servicos/registar', { mode: 'navigate' }))!.text()).toBe('network:/servicos/registar')
  })
  it('offline, every same-origin app route gets the precached shell (React Router boots there)', async () => {
    let offline = false
    const sw = load({ fetchImpl: async (r) => { if (offline) throw new TypeError('Failed to fetch'); return page(`shell:${new URL(r.url).pathname}`) } })
    await sw.install()
    offline = true
    for (const path of ['/', '/servicos/registar', '/stock', '/privado/entrar', '/privado/fecho?p=1']) {
      expect(await (await sw.request(path, { mode: 'navigate' }))!.text(), path).toBe('shell:/')
    }
  })
  it('a network that does not answer in time gets the shell', async () => {
    const sw = load()
    await sw.install()
    vi.useFakeTimers()
    sw.fetchSpy.mockImplementation(() => new Promise(() => {}))
    const res = sw.request('/', { mode: 'navigate' })!
    await vi.advanceTimersByTimeAsync(4000)
    expect(await (await res).text()).toBe('network:/')                      // the precached copy of "/"
  })
  it('precached shell files come from the cache', async () => {
    const sw = load()
    await sw.install()
    sw.fetchSpy.mockClear()
    expect(await (await sw.request('/assets/index-abc.js'))!.text()).toBe('network:/assets/index-abc.js')
    expect(sw.fetchSpy).not.toHaveBeenCalled()
  })
  it('never handles Supabase or any other origin, any non-GET, or anything outside the shell', async () => {
    const sw = load()
    await sw.install()
    expect(sw.request('/rest/v1/rpc/record_service', { method: 'POST', origin: 'https://xyz.supabase.co' })).toBeNull()
    expect(sw.request('/rest/v1/rpc/device_context', { method: 'POST', origin: 'https://xyz.supabase.co' })).toBeNull()
    expect(sw.request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', origin: 'https://xyz.supabase.co' })).toBeNull()
    expect(sw.request('/rest/v1/services?select=id', { origin: 'https://xyz.supabase.co' })).toBeNull()
    expect(sw.request('/rest/v1/services?select=id', { origin: 'https://xyz.supabase.co', mode: 'navigate' })).toBeNull()
    expect(sw.request('/turnstile/v0/api.js', { origin: 'https://challenges.cloudflare.com' })).toBeNull()
    expect(sw.request('/anything', { method: 'POST' })).toBeNull()
    expect(sw.request('/api/something')).toBeNull()                           // same origin, not a navigation, not precached
    expect(sw.request('/assets/index-abc.js?v=2')).toBeNull()
    expect(sw.request('/icons/unknown.png', { mode: 'navigate' })).toBeNull() // a file, not an app route
  })
})

describe('what the worker never does', () => {
  it('no runtime caching, no Background / periodic Sync, no IndexedDB, no commands, no Supabase', () => {
    const c = code(template)
    expect(c).not.toMatch(/\.put\(|cache\.add\(|caches\.match\(/)               // only the precache list enters the cache
    expect(c).not.toMatch(/indexedDB|IDB|sync\.register|periodicSync|SyncManager|addEventListener\('sync'|addEventListener\('periodicsync'/)
    expect(c).not.toMatch(/supabase|rpc|record_service|outbox|localStorage|postMessage|skipWaiting/i)
    const sw = load()
    expect(sw.self.registration.sync.register).not.toHaveBeenCalled()
    expect(sw.self.registration.periodicSync.register).not.toHaveBeenCalled()
  })
})
