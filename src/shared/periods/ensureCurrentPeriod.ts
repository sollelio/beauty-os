// The current week before any record (period lifecycle, 20261103000100): periods are generated from the organization's
// schedule, by the first record of a day or by this narrow, idempotent command. Reads stay read-only, so the app ensures
// today's week before it resolves a default period (Fecho, Negócio, Situação) — on Monday morning they open on the new
// week. At most one call per few minutes; a failure (offline, an older database) never blocks the read that follows.
import { getSupabase } from '../supabase/client'

const TTL_MS = 5 * 60 * 1000
let last: { at: number; done: Promise<void> } | null = null

export function ensureCurrentPeriod(now: number = Date.now()): Promise<void> {
  if (last && now - last.at < TTL_MS) return last.done
  const done = Promise.resolve(getSupabase().rpc('ensure_current_period'))
    .then(({ error }) => { if (error) last = null })
    .catch(() => { last = null })
  last = { at: now, done }
  return done
}

/** Before a read whose period is the default one (null), ensure today's week exists. */
export async function withCurrentPeriod<T>(period: string | null, read: () => Promise<T>): Promise<T> {
  if (period === null) await ensureCurrentPeriod()
  return read()
}

/** Test seam. */
export function resetEnsureCurrentPeriod() { last = null }
