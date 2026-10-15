// Registers the static-shell service worker (ADR-0010 §7) in production builds only. It lets the installed app open
// without a connection; it caches no data and sends nothing. A new version waits until every Beauty OS window has
// closed (no forced reload during a capture). Registration failure is harmless: the app works online as before.
export function registerServiceWorker(nav: Navigator = navigator) {
  if (!import.meta.env.PROD || !('serviceWorker' in nav)) return
  const register = () => { nav.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => { /* online as before */ }) }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
