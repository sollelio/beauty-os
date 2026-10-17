// When the «Limiar» brand moment presents itself (Tenant Identity T3): once per device-to-tenant enrollment, never on
// an ordinary opening. Enrollment marks the new identity as pending; the first Hoje of that identity and organization
// presents the moment and records it as presented when it starts (closing the app midway never repeats it). A new
// enrollment — another salon, or the same salon under a new identity — presents it again. Devices enrolled before this
// existed are never pending: they replay it from «Este telemóvel». Small UI flags (ADR-0010 §6); unavailable storage
// only means the moment is not presented automatically.

const PENDING = 'beauty-os.limiar.pending'      // the device principal that has just enrolled
const PRESENTED = 'beauty-os.limiar.presented'  // `${principal}:${organizationId}` the moment was last presented for

function read(key: string): string | null {
  try { return globalThis.localStorage?.getItem(key) ?? null } catch { return null }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key)
    else globalThis.localStorage?.setItem(key, value)
  } catch { /* private mode or blocked storage: nothing is presented automatically */ }
}

/** After a successful enrollment, with the device principal that now holds the binding. */
export function markEnrolled(principal: string | null) {
  if (principal) write(PENDING, principal)
}

/** Whether Hoje should present the moment now for this identity and organization. */
export function shouldPresent(principal: string | null, organizationId: string): boolean {
  return principal !== null && read(PENDING) === principal && read(PRESENTED) !== `${principal}:${organizationId}`
}

/** Recorded when the moment starts, so it is never presented twice for one enrollment. */
export function markPresented(principal: string, organizationId: string) {
  write(PRESENTED, `${principal}:${organizationId}`)
  write(PENDING, null)
}

/** The still presentation: reduced motion, or a browser that cannot animate clip-path (the motion spec's fallback). */
export function prefersStill(win: Pick<Window, 'matchMedia'> | undefined = globalThis.window): boolean {
  const reduced = win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const clip = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('clip-path', 'polygon(0 0, 100% 0, 0 100%)')
  return reduced || !clip
}
