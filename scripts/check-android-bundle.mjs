// Android Slice A1 · checks the web bundle copied into the Android project (after `cap sync android`):
// bundled assets only (no remote server.url), Supabase Dev only, no secret/service-role key. Never prints a key.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEV_PROJECT_REF = 'plukxnjnmowlnplpgsnm'
const root = fileURLToPath(new URL('../android/app/src/main/assets/', import.meta.url))
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] })
const failures = []

const config = JSON.parse(readFileSync(join(root, 'capacitor.config.json'), 'utf8'))
if (config.server?.url) failures.push(`capacitor.config.json sets server.url (${config.server.url}): the app must load its bundled assets`)
console.log(`appId ${config.appId} · webDir bundled · server.url ${config.server?.url ? 'SET' : 'none'}`)

const files = walk(join(root, 'public'))
const text = files.filter((f) => /\.(js|html|json|webmanifest)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n')
if (!files.some((f) => f.endsWith(join('public', 'index.html')))) failures.push('index.html missing from the bundled assets')

const refs = [...new Set([...text.matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)].map((m) => m[1]))]
console.log(`Supabase project refs in the bundle: ${refs.join(', ') || 'none'}`)
if (refs.length !== 1 || refs[0] !== DEV_PROJECT_REF) failures.push(`expected only the Supabase Dev project (${DEV_PROJECT_REF})`)

// an actual secret key value (supabase-js itself contains the bare `sb_secret_` prefix), or a legacy service_role JWT
if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(text)) failures.push('a secret key (sb_secret_…) is in the bundle')
const jwtRoles = [...text.matchAll(/eyJ[\w-]{10,}\.(eyJ[\w-]{10,})\.[\w-]+/g)]
  .map((m) => { try { return JSON.parse(Buffer.from(m[1], 'base64url').toString()).role } catch { return undefined } })
if (jwtRoles.includes('service_role')) failures.push('a service_role JWT is in the bundle')
if (/netlify\.app/.test(text)) failures.push('the bundle references a Netlify host')

for (const f of failures) console.error(`FAIL: ${f}`)
console.log(failures.length ? 'Android bundle check FAILED' : 'Android bundle check OK')
process.exit(failures.length ? 1 : 0)
