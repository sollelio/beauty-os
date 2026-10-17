// Tenant Identity T2 · the bound organization's logo as image URLs for the screens, or null (the name only). On every
// binding it removes the files of any other binding, shows this binding's cached files, and downloads them only when
// they are missing and the device is online. Rendering never waits for it: the screens start with the name only.
import { useEffect, useState, type ReactNode } from 'react'
import { useConnectivity } from '../../shared/offline/connectivity'
import { openSharedOfflineDb } from '../../shared/offline/db'
import type { Organization } from './api'
import { clearLogosExcept, downloadLogo, LOGO_SIZES, readCachedLogo, saveLogo, type LogoFiles } from './logo'
import { TenantMarkContext, type TenantMark } from './tenantMark'

type Shown = { key: string; mark: TenantMark; urls: string[] }

export function TenantLogoProvider({ principal, organization, children }: {
  principal: string | null; organization: Organization | null; children: ReactNode
}) {
  const online = useConnectivity() === 'online'
  const orgId = organization?.id ?? null
  const logo = organization?.logo ?? null
  const key = principal && orgId && logo ? `${principal}:${orgId}:${logo.version}` : null
  const [shown, setShown] = useState<Shown | null>(null)

  useEffect(() => {
    if (shown && shown.key === key) return
    let live = true
    const partition = principal && orgId ? { organizationId: orgId, deviceUserId: principal } : null
    void (async () => {
      // another identity, another organization, no binding, or a logo the organization no longer has: its files are
      // removed. No offline database: the logo is kept in memory only.
      const keep = logo ? partition : null
      const db = await openSharedOfflineDb().then(async (d) => { await clearLogosExcept(d, keep); return d }).catch(() => null)
      if (!partition || !logo || !key) return
      let files: LogoFiles | null = db ? await readCachedLogo(db, partition, logo.version).catch(() => null) : null
      if (!files && online) {
        try {
          files = await downloadLogo(partition.organizationId, logo)
          if (db) await saveLogo(db, partition, logo.version, files).catch(() => {})
        } catch { files = null }                             // not configured on the server, refused, or no network
      }
      if (!files || !live) return
      const urls = LOGO_SIZES.map((s) => URL.createObjectURL(files[s]))
      setShown({ key, urls, mark: { src32: urls[0]!, src64: urls[1]!, src512: urls[2]!, ring: logo.ring, iris: logo.iris } })
    })()
    return () => { live = false }
  }, [key, principal, orgId, logo, online, shown])

  // the previous files' URLs are released once the next ones are shown (or the provider leaves)
  useEffect(() => () => { shown?.urls.forEach((u) => URL.revokeObjectURL(u)) }, [shown])

  return <TenantMarkContext.Provider value={shown && shown.key === key ? shown.mark : null}>{children}</TenantMarkContext.Provider>
}
