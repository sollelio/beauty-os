import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL_ = env.VITE_SUPABASE_URL!, KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY!
if (!URL_?.includes('plukxnjnmowlnplpgsnm')) throw new Error('DB tests may only run against the Beauty OS Dev project')

export const client = (): SupabaseClient => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

export async function device(code: string | null): Promise<SupabaseClient> {
  const c = client()
  const { error } = await c.auth.signInAnonymously()
  if (error) throw error
  if (code) {
    const r = await c.rpc('redeem_enrollment', { p_code: code })
    if (r.error) throw r.error
  }
  return c
}

// Synthetic seed ids (supabase/seed.sql)
export const A = {
  org: '00000000-0000-4000-8000-0000000000a1', person: '00000000-0000-4000-8000-00000000a201',
  service: '00000000-0000-4000-8000-00000000a301', cash: '00000000-0000-4000-8000-00000000a101', transfer: '00000000-0000-4000-8000-00000000a102',
}
export const B = {
  org: '00000000-0000-4000-8000-0000000000b1', person: '00000000-0000-4000-8000-00000000b201',
  service: '00000000-0000-4000-8000-00000000b301', cash: '00000000-0000-4000-8000-00000000b101',
}
