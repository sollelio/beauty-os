// Android R2 · checks the web bundle copied into the Android project (after `cap sync android`) for one environment:
// bundled assets only (no remote server.url), built for that environment (marker), its Supabase project only, CAPTCHA
// where required, no secret / service-role key. Never prints a key. Usage: node scripts/check-android-bundle.mjs dev|prod
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkAndroidBundle, ENVIRONMENTS, MARKER_FILE } from './androidEnvironment.ts'

const env = process.argv[2]
if (!(env in ENVIRONMENTS)) {
  console.error('Usage: node scripts/check-android-bundle.mjs dev|prod')
  process.exit(2)
}
const root = fileURLToPath(new URL('../android/app/src/main/assets/', import.meta.url))
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] })

const capacitorConfig = JSON.parse(readFileSync(join(root, 'capacitor.config.json'), 'utf8'))
const markerPath = join(root, 'public', MARKER_FILE)
const marker = existsSync(markerPath) ? JSON.parse(readFileSync(markerPath, 'utf8')) : null
const text = walk(join(root, 'public')).filter((f) => /\.(js|html|json|webmanifest)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n')

const failures = checkAndroidBundle(env, { capacitorConfig, marker, text })
console.log(`environment ${env} · applicationId ${ENVIRONMENTS[env].applicationId} · server.url ${capacitorConfig.server?.url ? 'SET' : 'none'} · marker ${marker ? marker.environment : 'missing'}`)
for (const f of failures) console.error(`FAIL: ${f}`)
console.log(failures.length ? `Android ${env} bundle check FAILED` : `Android ${env} bundle check OK`)
process.exit(failures.length ? 1 : 0)
