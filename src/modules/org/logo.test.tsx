// Tenant Identity T2 · the organization's logo on the device: one version per binding in the offline database, cache
// first, downloaded only online and only when missing, removed for any other binding, never blocking the screens.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { openSharedOfflineDb } from '../../shared/offline/db'
import { checkLogo } from '../../shared/offline/binding'
import type { Organization } from './api'

vi.mock('./logo', async (orig) => ({ ...(await orig<typeof import('./logo')>()), downloadLogo: vi.fn() }))
import { clearLogosExcept, downloadLogo, LOGO_SIZES, logoPath, readCachedLogo, saveLogo, type LogoFiles } from './logo'
import { TenantLogoProvider } from './TenantLogo'
import { useTenantMark } from './tenantMark'

const O1 = '00000000-0000-4000-8000-0000000000a1', O2 = '00000000-0000-4000-8000-0000000000b1'
const P1 = '11111111-1111-4111-8111-111111111111', P2 = '22222222-2222-4222-8222-222222222222'
const files = (tag: string): LogoFiles => Object.fromEntries(LOGO_SIZES.map((s) => [s, new Blob([`${tag}-${s}`], { type: 'image/png' })])) as LogoFiles
const text = async (f: LogoFiles | null) => f && Promise.all(LOGO_SIZES.map((s) => f[s].text()))
const org = (logo: Organization['logo'], id = O1): Organization =>
  ({ id, name: 'Salão Teste', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz', logo })
const RING = { color: '#39783F', radius: 0.393, width: 0.032 }

let online = true
Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })
let urls = 0
beforeEach(async () => {
  online = true; urls = 0
  vi.mocked(downloadLogo).mockReset()
  URL.createObjectURL = vi.fn(() => `blob:logo-${++urls}`)
  URL.revokeObjectURL = vi.fn()
  await clearLogosExcept(await openSharedOfflineDb(), null)
})
afterEach(() => vi.clearAllMocks())

function Probe() {
  const mark = useTenantMark()
  return <p data-testid="mark">{mark ? `${mark.src32} ${mark.src64} ${mark.src512} ${mark.ring?.color ?? '-'} ${mark.iris ?? '-'}` : 'name only'}</p>
}
const mount = (principal: string | null, organization: Organization | null) =>
  render(<TenantLogoProvider principal={principal} organization={organization}><Probe /></TenantLogoProvider>)

describe('the logo cache (offline database)', () => {
  it('paths are organization-prefixed and versioned', () => {
    expect(logoPath(O1, 3, 64)).toBe(`${O1}/3/symbol-64.png`)
  })
  it('keeps one version per binding; another version reads as missing', async () => {
    const db = await openSharedOfflineDb()
    await saveLogo(db, { organizationId: O1, deviceUserId: P1 }, 1, files('v1'))
    expect(await text(await readCachedLogo(db, { organizationId: O1, deviceUserId: P1 }, 1))).toEqual(['v1-32', 'v1-64', 'v1-512'])
    expect(await readCachedLogo(db, { organizationId: O1, deviceUserId: P1 }, 2)).toBeNull()
    expect(await readCachedLogo(db, { organizationId: O1, deviceUserId: P2 }, 1)).toBeNull()      // another identity: nothing
    await saveLogo(db, { organizationId: O1, deviceUserId: P1 }, 2, files('v2'))
    expect(await readCachedLogo(db, { organizationId: O1, deviceUserId: P1 }, 1)).toBeNull()       // replaced, not kept
  })
  it('removes every binding but the current one; an unbound device keeps none', async () => {
    const db = await openSharedOfflineDb()
    await saveLogo(db, { organizationId: O1, deviceUserId: P1 }, 1, files('a'))
    await saveLogo(db, { organizationId: O2, deviceUserId: P2 }, 1, files('b'))
    expect(await clearLogosExcept(db, { organizationId: O2, deviceUserId: P2 })).toBe(3)
    expect(await readCachedLogo(db, { organizationId: O1, deviceUserId: P1 }, 1)).toBeNull()
    expect(await readCachedLogo(db, { organizationId: O2, deviceUserId: P2 }, 1)).not.toBeNull()
    expect(await clearLogosExcept(db, null)).toBe(3)
    expect(await readCachedLogo(db, { organizationId: O2, deviceUserId: P2 }, 1)).toBeNull()
  })
  it('the logo reference is taken only as the server writes it', () => {
    expect(checkLogo({ version: 2, ring: RING, iris: 0.415 })).toEqual({ version: 2, ring: RING, iris: 0.415 })
    expect(checkLogo({ version: 2, ring: { color: 'green', radius: 0.4, width: 0.03 }, iris: 0.9 })).toEqual({ version: 2 })
    for (const bad of [null, undefined, 'x', { version: 0 }, { version: 1.5 }, { version: '1' }]) expect(checkLogo(bad)).toBeNull()
  })
})

describe('TenantLogoProvider', () => {
  it('no logo reference (never configured, or removed): nothing downloaded, the name only, earlier files removed', async () => {
    const db = await openSharedOfflineDb()
    await saveLogo(db, { organizationId: O1, deviceUserId: P1 }, 1, files('was'))
    mount(P1, org(null))
    await waitFor(async () => expect(await readCachedLogo(db, { organizationId: O1, deviceUserId: P1 }, 1)).toBeNull())
    expect(screen.getByTestId('mark').textContent).toBe('name only')
    expect(downloadLogo).not.toHaveBeenCalled()
  })
  it('online and missing: downloaded once, shown with its geometry, kept; reopened offline, shown from the device', async () => {
    vi.mocked(downloadLogo).mockResolvedValue(files('v1'))
    const first = mount(P1, org({ version: 1, ring: RING, iris: 0.415 }))
    expect(screen.getByTestId('mark').textContent).toBe('name only')                                // never waits
    await waitFor(() => expect(screen.getByTestId('mark').textContent).toBe('blob:logo-1 blob:logo-2 blob:logo-3 #39783F 0.415'))
    expect(downloadLogo).toHaveBeenCalledWith(O1, { version: 1, ring: RING, iris: 0.415 })
    first.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3)                                              // released on leaving
    online = false
    mount(P1, org({ version: 1, ring: RING, iris: 0.415 }))
    await waitFor(() => expect(screen.getByTestId('mark').textContent).not.toBe('name only'))
    expect(downloadLogo).toHaveBeenCalledTimes(1)
  })
  it('offline without the files: the name only, and no download is attempted', async () => {
    online = false
    mount(P1, org({ version: 1 }))
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.getByTestId('mark').textContent).toBe('name only')
    expect(downloadLogo).not.toHaveBeenCalled()
  })
  it('refused or failing download (another organization\'s path, not configured, no network): the name only', async () => {
    vi.mocked(downloadLogo).mockRejectedValue(new Error('Object not found'))
    mount(P1, org({ version: 1 }))
    await waitFor(() => expect(downloadLogo).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.getByTestId('mark').textContent).toBe('name only')
  })
  it('a new version is downloaded and replaces the cached one', async () => {
    const db = await openSharedOfflineDb()
    await saveLogo(db, { organizationId: O1, deviceUserId: P1 }, 1, files('v1'))
    vi.mocked(downloadLogo).mockResolvedValue(files('v2'))
    mount(P1, org({ version: 2 }))
    await waitFor(() => expect(screen.getByTestId('mark').textContent).not.toBe('name only'))
    expect(downloadLogo).toHaveBeenCalledWith(O1, { version: 2 })
    await waitFor(async () => expect(await text(await readCachedLogo(db, { organizationId: O1, deviceUserId: P1 }, 2))).toEqual(['v2-32', 'v2-64', 'v2-512']))
    expect(await readCachedLogo(db, { organizationId: O1, deviceUserId: P1 }, 1)).toBeNull()
  })
  it('re-enrolled under a new identity: the previous binding\'s files are removed; unbound: none are kept', async () => {
    const db = await openSharedOfflineDb()
    await saveLogo(db, { organizationId: O1, deviceUserId: P1 }, 1, files('old'))
    online = false
    const view = mount(P2, org({ version: 1 }, O2))
    await waitFor(async () => expect(await readCachedLogo(db, { organizationId: O1, deviceUserId: P1 }, 1)).toBeNull())
    view.unmount()
    await saveLogo(db, { organizationId: O2, deviceUserId: P2 }, 1, files('cur'))
    mount(P2, null)                                                                                    // the server says: not bound
    await waitFor(async () => expect(await readCachedLogo(db, { organizationId: O2, deviceUserId: P2 }, 1)).toBeNull())
    expect(screen.getByTestId('mark').textContent).toBe('name only')
  })
})
