// The device sync report (ADR-0010 §5; Offline 7): what this device still holds, per day of the organization's time
// zone, so the server can tell for each period whether this device is synchronized. Counts only — never content.
// Services not yet on the server are "services", movement drafts waiting for a PIN are "drafts", anything needing a
// person's review (a refused service, a refused draft) is "conflicts". Work whose time cannot be read is "undated":
// it counts against every period, so unknown local work never drops out of the safety check.
import { dayKey } from '../time'
import type { OfflineStore } from './store'
import { isIsoInstant } from './validate'

type Counts = { services: number; drafts: number; conflicts: number }
export type SyncReport = { days: ({ day: string } & Counts)[]; undated: Counts }

export async function buildSyncReport(store: OfflineStore, timeZone: string): Promise<SyncReport> {
  const days = new Map<string, Counts>()
  const undated: Counts = { services: 0, drafts: 0, conflicts: 0 }
  const add = (iso: string, kind: keyof Counts) => {
    let day: string | null
    try { day = isIsoInstant(iso) ? dayKey(iso, timeZone) : null } catch { day = null }
    if (!day) { undated[kind]++; return }
    const c = days.get(day) ?? { services: 0, drafts: 0, conflicts: 0 }
    c[kind]++
    days.set(day, c)
  }
  for (const item of await store.outbox.list()) {
    if (item.state === 'synced') continue
    add(item.occurredAt, item.state === 'conflict' ? 'conflicts' : 'services')
  }
  for (const d of await store.drafts.list()) {
    if (d.state !== 'draft') continue
    add(d.capturedAt, (d.payload as { review?: unknown }).review ? 'conflicts' : 'drafts')
  }
  return { days: [...days].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, c]) => ({ day, ...c })), undated }
}
