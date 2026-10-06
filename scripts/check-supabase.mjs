// Harmless connectivity check against the Supabase project in .env.local.
// Calls the public Auth health endpoint with the publishable key. Never prints the key.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env.local')
  process.exit(1)
}
if (!key.startsWith('sb_publishable_')) {
  console.error('VITE_SUPABASE_PUBLISHABLE_KEY does not look like a publishable key. Never use a secret/service-role key in the frontend.')
  process.exit(1)
}
const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } })
console.log(`Supabase ${new URL(url).host}: auth health ${res.status} ${res.ok ? 'OK' : 'FAILED'}`)
process.exit(res.ok ? 0 : 1)
