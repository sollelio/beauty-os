// Beauty OS static-shell service worker (ADR-0010 §7; Offline 5). Template: the build (pwa/serviceWorkerPlugin.ts)
// replaces the two placeholders and writes dist/sw.js.
//
// It only lets the installed app open without a connection:
//  · precaches this build's static shell (index.html at "/", the hashed JS/CSS, the manifest and icons);
//  · same-origin app navigations: network first; without a network (or after a short wait), the precached shell;
//  · precached files: from the cache;
//  · everything else — Supabase (REST, RPC, Auth), any other origin, any non-GET request, any other path — is never
//    handled here: no respondWith, no caching, no reading of bodies.
// It never stores a response at runtime, never submits commands, has no Background Sync and never opens IndexedDB:
// synchronization stays in the foreground application (ADR-0010 §9).
// Lifecycle: a new version installs its whole shell or fails (addAll is all-or-nothing); it does NOT skip waiting, so it
// takes over only when every Beauty OS window has closed — a running capture is never reloaded. On activation it
// deletes only older Beauty OS shell caches.

const VERSION = '__BEAUTY_OS_SHELL_VERSION__'
const PRECACHE = /** @type {string[]} */ (__BEAUTY_OS_PRECACHE__)
const CACHE_PREFIX = 'beauty-os-shell-'
const CACHE = CACHE_PREFIX + VERSION
const SHELL = '/'                                // index.html, as the server serves the app entry
const NAVIGATION_TIMEOUT_MS = 4000
const PRECACHED = new Set(PRECACHE)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),     // first install: control the open window too; an update reaches here only once old windows are gone
  )
})

/** A same-origin navigation to an app route (not to a file such as /icons/x.png). */
function isAppNavigation(request, url) {
  return request.mode === 'navigate' && request.method === 'GET' && url.origin === self.location.origin && !/\.[a-z0-9]+$/i.test(url.pathname)
}

function shellResponse() {
  return caches.open(CACHE).then((cache) => cache.match(SHELL))
}

/** The network's answer for a navigation; the precached shell when there is no network or it does not answer in time. */
function navigate(request) {
  return new Promise((resolve) => {
    let settled = false
    const fallback = () => shellResponse().then((cached) => {
      if (settled) return
      if (cached) { settled = true; resolve(cached) }
    })
    const timer = setTimeout(fallback, NAVIGATION_TIMEOUT_MS)
    fetch(request).then(
      (response) => { clearTimeout(timer); if (!settled) { settled = true; resolve(response) } },
      () => {
        clearTimeout(timer)
        shellResponse().then((cached) => { if (!settled) { settled = true; resolve(cached || Response.error()) } })
      },
    )
  })
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return                  // Supabase, Turnstile, anything else: not ours
  if (isAppNavigation(request, url)) { event.respondWith(navigate(request)); return }
  if (PRECACHED.has(url.pathname) && url.search === '') {
    event.respondWith(caches.open(CACHE).then((cache) => cache.match(url.pathname)).then((cached) => cached || fetch(request)))
  }
  // any other request is left to the browser untouched
})
