// Reads the public runtime configuration from the Vite environment.
// Only public values belong here: the project URL and the publishable key.

export type SupabaseConfig = { url: string; publishableKey: string }

export class ConfigError extends Error {}

export function readSupabaseConfig(): SupabaseConfig {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  const missing = [
    !url && 'VITE_SUPABASE_URL',
    !publishableKey && 'VITE_SUPABASE_PUBLISHABLE_KEY',
  ].filter(Boolean)
  if (missing.length > 0 || !url || !publishableKey) {
    throw new ConfigError(
      `Missing ${missing.join(' and ')}. Copy .env.example to .env.local and fill in the Supabase Dev values.`,
    )
  }
  return { url, publishableKey }
}
