// Tenant Identity T2 · organization logos in the private bucket (migration 20261017000300, ADR-0002): a bound device
// reads its own organization's logo and nothing else; another organization's device, an unbound one and the publishable
// key alone read nothing; no browser can write, overwrite, remove or publish a file. Prerequisites (Dev only): the
// migration applied, the six fixture files uploaded by the operator and supabase/seeds/21_tenant_logo_fixture.sql run.
// Anonymous sign-ins are rate-limited on Dev (30 per hour per IP): 3 devices.
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { A, B, client, device } from './env'

const BUCKET = 'organization-logos'
const path = (org: string, size: number, version = 1) => `${org}/${version}/symbol-${size}.png`
const SIZES = [32, 64, 512]
type Row = Record<string, any>                                  // eslint-disable-line @typescript-eslint/no-explicit-any

let devA: SupabaseClient, devB: SupabaseClient, unbound: SupabaseClient
beforeAll(async () => {
  devA = await device('TEST-ORG-A-2026')
  devB = await device('TEST-ORG-B-2026')
  unbound = await device(null)
})

describe('the device context names the organization\'s logo', () => {
  it('a versioned reference with its presentation geometry; another organization\'s is its own', async () => {
    expect(((await devA.rpc('device_context')).data as Row).organization.logo).toEqual({ version: 1, ring: { color: '#5B5F68', radius: 0.45, width: 0.03 }, iris: 0.5 })
    expect(((await devB.rpc('device_context')).data as Row).organization.logo).toEqual({ version: 1 })
    expect((await unbound.rpc('device_context')).data).toEqual({ bound: false })
  })
})

describe('reading', () => {
  it('a bound device downloads its own organization\'s three files', async () => {
    for (const s of SIZES) {
      const { data, error } = await devA.storage.from(BUCKET).download(path(A.org, s))
      expect(error, `${s}: ${error?.message}`).toBeNull()
      expect([data!.type, data!.size > 0]).toEqual(['image/png', true])
    }
  })
  it('another organization\'s files are invisible, in both directions', async () => {
    for (const s of SIZES) {
      expect((await devA.storage.from(BUCKET).download(path(B.org, s))).error, `A→B ${s}`).not.toBeNull()
      expect((await devB.storage.from(BUCKET).download(path(A.org, s))).error, `B→A ${s}`).not.toBeNull()
    }
    expect((await devA.storage.from(BUCKET).list(B.org)).data ?? []).toEqual([])
    expect(((await devA.storage.from(BUCKET).list(`${A.org}/1`)).data ?? []).map((o) => o.name).sort()).toEqual(['symbol-32.png', 'symbol-512.png', 'symbol-64.png'])
  })
  it('an unbound device and the publishable key alone read nothing; the bucket has no public address', async () => {
    const pub = client()
    for (const c of [unbound, pub]) {
      expect((await c.storage.from(BUCKET).download(path(A.org, 64))).error).not.toBeNull()
      expect((await c.storage.from(BUCKET).list(A.org)).data ?? []).toEqual([])
    }
    const res = await fetch(pub.storage.from(BUCKET).getPublicUrl(path(A.org, 64)).data.publicUrl)
    expect(res.ok).toBe(false)
  })
  it('a signed link can only be made for one\'s own organization\'s file', async () => {
    expect((await devA.storage.from(BUCKET).createSignedUrl(path(B.org, 64), 60)).error).not.toBeNull()
    expect((await unbound.storage.from(BUCKET).createSignedUrl(path(A.org, 64), 60)).error).not.toBeNull()
  })
})

describe('writing: never from a browser', () => {
  const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })
  it('a bound device cannot upload, overwrite, move or remove — not even its own organization\'s files', async () => {
    const own = devA.storage.from(BUCKET)
    expect((await own.upload(path(A.org, 64, 9), png())).error).not.toBeNull()
    expect((await own.upload(path(A.org, 64), png(), { upsert: true })).error).not.toBeNull()
    expect((await own.update(path(A.org, 64), png())).error).not.toBeNull()
    expect((await own.move(path(A.org, 64), path(A.org, 64, 8))).error).not.toBeNull()
    await own.remove([path(A.org, 64)])                                                    // refused (or a silent no-op)
    const still = await own.download(path(A.org, 64))
    expect([still.error, still.data?.size]).toEqual([null, 159])                           // the fixture is unchanged
  })
  it('nor an unbound device or the publishable key; nor can anyone create a bucket', async () => {
    for (const c of [unbound, client()]) expect((await c.storage.from(BUCKET).upload(path(A.org, 64, 7), png())).error).not.toBeNull()
    expect((await devA.storage.createBucket('organization-logos-x', { public: true })).error).not.toBeNull()
  })
  it('the operator procedures are not callable from a browser', async () => {
    const r = await devA.rpc('admin_set_organization_logo', { p_org: A.org, p_version: 1 })
    expect(r.error).not.toBeNull()
    const r2 = await devA.schema('private').rpc('admin_set_organization_logo', { p_org: A.org, p_version: 1 })
    expect(r2.error?.code).toBe('PGRST106')
  })
})
