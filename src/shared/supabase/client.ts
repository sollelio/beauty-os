// Infrastructure only: the single browser Supabase client.
// Uses the publishable key; there is no admin/service-role client in the browser (ADR-0002, ADR-0003).
// Components must not import this directly; module access layers do (ADR-0008).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseConfig } from '../config/env'

let client: SupabaseClient | undefined

export function getSupabase(): SupabaseClient {
  if (!client) {
    const { url, publishableKey } = readSupabaseConfig()
    client = createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return client
}
