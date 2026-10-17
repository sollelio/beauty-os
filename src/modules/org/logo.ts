// Tenant Identity T2 · the bound organization's logo on this device. Files come from the private `organization-logos`
// bucket — the server lets a bound device read its own organization's prefix only (ADR-0002) — and are kept in the
// offline database, keyed by organization and device principal, so Hoje, «Este telemóvel» and «Limiar» show it offline.
// Anything that is not the current binding (another identity, another organization, an unbound device) is removed.
// Nothing here is authorization, and nothing waits for it: without the files the app shows the name only.
import { getSupabase } from '../../shared/supabase/client'
import { LOGO_STORE, promised, transact } from '../../shared/offline/db'
import type { Partition } from '../../shared/offline/types'
import type { TenantLogo } from './api'

export const LOGO_BUCKET = 'organization-logos'
export const LOGO_SIZES = [32, 64, 512] as const
export type LogoSize = (typeof LOGO_SIZES)[number]
export type LogoFiles = Record<LogoSize, Blob>
const MAX_BYTES = 262144                                       // the bucket's own limit

/** <organization>/<version>/symbol-<size>.png — versioned: a new logo is a new version, never an overwrite. */
export const logoPath = (organizationId: string, version: number, size: LogoSize) => `${organizationId}/${version}/symbol-${size}.png`

type LogoRecord = Partition & { size: LogoSize; version: number; type: string; bytes: ArrayBuffer }

/** The three files of this version for this binding, or null (none, another version, or incomplete). */
export async function readCachedLogo(db: IDBDatabase, p: Partition, version: number): Promise<LogoFiles | null> {
  const rows = await transact(db, [LOGO_STORE], 'readonly', (tx) => Promise.all(LOGO_SIZES.map((size) =>
    promised(tx.objectStore(LOGO_STORE).get([p.organizationId, p.deviceUserId, size])) as Promise<LogoRecord | undefined>)))
  if (rows.some((r) => !r || r.version !== version)) return null
  return Object.fromEntries(rows.map((r) => [r!.size, new Blob([r!.bytes], { type: r!.type })])) as LogoFiles
}

/** Keeps this version's files for this binding (replacing any earlier version). */
export async function saveLogo(db: IDBDatabase, p: Partition, version: number, files: LogoFiles): Promise<void> {
  const rows: LogoRecord[] = await Promise.all(LOGO_SIZES.map(async (size) => ({
    organizationId: p.organizationId, deviceUserId: p.deviceUserId, size, version, type: files[size].type || 'image/png', bytes: await files[size].arrayBuffer(),
  })))
  await transact(db, [LOGO_STORE], 'readwrite', async (tx) => { for (const r of rows) await promised(tx.objectStore(LOGO_STORE).put(r)) })
}

/** Removes every logo file that does not belong to `keep` (null: all of them — an unbound device keeps none). */
export async function clearLogosExcept(db: IDBDatabase, keep: Partition | null): Promise<number> {
  return transact(db, [LOGO_STORE], 'readwrite', async (tx) => {
    const store = tx.objectStore(LOGO_STORE)
    const keys = (await promised(store.getAllKeys())) as [string, string, number][]
    const stale = keys.filter(([org, user]) => !keep || org !== keep.organizationId || user !== keep.deviceUserId)
    for (const k of stale) await promised(store.delete(k))
    return stale.length
  })
}

/** Downloads this version's three files (online, bound device). Fails if any file is missing, too large or not an image. */
export async function downloadLogo(organizationId: string, logo: TenantLogo): Promise<LogoFiles> {
  const bucket = getSupabase().storage.from(LOGO_BUCKET)
  const files = await Promise.all(LOGO_SIZES.map(async (size) => {
    const { data, error } = await bucket.download(logoPath(organizationId, logo.version, size))
    if (error || !data) throw error ?? new Error('logo file missing')
    if (data.size === 0 || data.size > MAX_BYTES || !/^image\/(png|webp)$/.test(data.type)) throw new Error('logo file not usable')
    return [size, data] as const
  }))
  return Object.fromEntries(files) as LogoFiles
}
