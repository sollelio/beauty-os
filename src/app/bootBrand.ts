// Brand Splash (learning experience L1, docs/design/learning-experience.md): index.html paints the official Beauty OS
// lockup over the app from the first frame (#boot-brand). It is presentation during real loading only — never a timer
// or a minimum. It stays while something is genuinely still loading (a <BootPending />, DeviceGate's loading states)
// and leaves at the first moment nothing is: the app's first commit with none mounted, the last one unmounting (an
// outcome: Hoje, enrollment, the cached binding, a connection or server notice, an error screen), a configuration
// error, or any uncaught error. It never blocks a tap (pointer-events: none) and is aria-hidden: the app's own
// «A carregar…» underneath stays the accessible status.
export const BOOT_BRAND_ID = 'boot-brand'
const LEAVING = 'bb-leaving'

let pending = 0

/** Removes the brand: a 200 ms fade (CSS), or at once under reduced motion. Safe to call any number of times. */
export function dismissBootBrand(doc: Document = document): void {
  const el = doc.getElementById(BOOT_BRAND_ID)
  if (!el || el.classList.contains(LEAVING)) return
  const reduced = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  if (reduced) { el.remove(); return }
  // the fade ends hidden by itself (visibility: hidden); the element is then taken out of the document
  el.addEventListener('animationend', (e) => { if (e.target === el) el.remove() })
  el.classList.add(LEAVING)
}

/** After the current commit: if nothing is still loading, the brand leaves. A microtask, not a timer — it only lets
 *  a remount in the same commit (StrictMode, a loading branch replacing another) count before deciding. */
function settle(): void {
  queueMicrotask(() => { if (pending === 0) dismissBootBrand() })
}

/** Something is genuinely still loading; returns its end. */
export function holdBootBrand(): () => void {
  pending++
  let held = true
  return () => {
    if (!held) return
    held = false
    pending--
    settle()
  }
}

/** The app has committed: unless something holds it, the brand leaves. */
export function settleBootBrand(): void {
  settle()
}

/** An error before or outside React's tree must never leave the brand over it. Also marks the brand as started, so
 *  index.html's recovery (a retry, for an app that could not start) leaves later errors to this failsafe. */
export function armBootBrandFailsafe(win: Window = window): void {
  win.document.getElementById(BOOT_BRAND_ID)?.setAttribute('data-app-started', '')
  win.addEventListener('error', () => dismissBootBrand(win.document), { once: true })
}
