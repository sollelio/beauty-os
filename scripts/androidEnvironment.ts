// Android R2 · the web build for an Android flavor (ADR-0011): which Supabase project each environment may use, a
// fail-closed check of the build's environment, and the marker the Gradle build checks against the flavor it packages.
// One source of truth: android/environments.json (also read by android/app/build.gradle). Public values only.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

export type AndroidEnvironment = 'dev' | 'prod'
/** webViewHostname: the WebView origin's host (Capacitor `server.hostname`, default localhost). It fixes where the app's
 *  local data lives, so it must not change once installed; null = not approved yet, and the environment is refused. */
type Spec = { applicationId: string; appName: string; supabaseProjectRef: string; captcha: 'required' | 'optional'; webViewHostname: string | null }
export type Specs = Record<AndroidEnvironment, Spec>

export const ENVIRONMENTS = JSON.parse(readFileSync(resolve(import.meta.dirname, '../android/environments.json'), 'utf8')) as Specs
/** Android builds read their .env files only from here (`.env.android-dev.local`, `.env.android-prod.local`; ignored by Git). */
export const ANDROID_ENV_DIR = 'android/env'
/** Written into the web bundle; android/app/build.gradle refuses a flavor whose marker does not match. */
export const MARKER_FILE = 'beauty-os-android-env.json'
export type Marker = { environment: AndroidEnvironment; supabaseProjectRef: string; captcha: boolean }

/** `android-dev` / `android-prod` → the environment; any other mode is not an Android build (null). */
export function androidEnvironmentOf(mode: string): AndroidEnvironment | null {
  if (!mode.startsWith('android')) return null
  const env = mode.slice('android-'.length)
  if (mode !== `android-${env}` || !(env in ENVIRONMENTS)) throw new Error(`Unknown Android build mode "${mode}": use android-dev or android-prod.`)
  return env as AndroidEnvironment
}

export const supabaseRefsIn = (text: string) => [...new Set([...text.matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)].map((m) => m[1]!))]

/** The environment's variables as Vite will bundle them; throws, naming every problem, unless they are exactly right. */
export function validateAndroidEnv(env: AndroidEnvironment, vars: Record<string, string | undefined>, specs: Specs = ENVIRONMENTS): Marker {
  const spec = specs[env]
  const url = vars.VITE_SUPABASE_URL?.trim() ?? '', key = vars.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
  const captcha = !!vars.VITE_TURNSTILE_SITE_KEY?.trim()
  const problems: string[] = []
  if (spec.webViewHostname === null) problems.push(HOSTNAME_NOT_APPROVED(env))
  if (url !== `https://${spec.supabaseProjectRef}.supabase.co`) {
    problems.push(`VITE_SUPABASE_URL must be the ${env} project (${spec.supabaseProjectRef}); got ${url ? supabaseRefsIn(url)[0] ?? 'another URL' : 'nothing'}`)
  }
  if (!key.startsWith('sb_publishable_')) problems.push('VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable key (sb_publishable_…)')
  if (spec.captcha === 'required' && !captcha) problems.push(`VITE_TURNSTILE_SITE_KEY is required for ${env} (its Auth requires CAPTCHA)`)
  if (problems.length) {
    throw new Error(`Android ${env} build refused:\n- ${problems.join('\n- ')}\nSet them in ${ANDROID_ENV_DIR}/.env.android-${env}.local (see ${ANDROID_ENV_DIR}/README.md).`)
  }
  return { environment: env, supabaseProjectRef: spec.supabaseProjectRef, captcha }
}

const HOSTNAME_NOT_APPROVED = (env: AndroidEnvironment) =>
  `${env} Android builds are refused until the WebView hostname is approved and configured (ADR-0011; webViewHostname in android/environments.json)`

/** Vite plugin (Android builds only): refuses the build unless its environment is valid, then writes the marker. */
export function androidEnvironment(env: AndroidEnvironment): Plugin {
  let marker: Marker
  return {
    name: 'beauty-os-android-environment',
    apply: 'build',
    configResolved(config) { marker = validateAndroidEnv(env, config.env) },
    generateBundle() { this.emitFile({ type: 'asset', fileName: MARKER_FILE, source: JSON.stringify(marker) }) },
  }
}

/** What `cap sync` copied into the Android project, checked for one environment; returns the failures (none = OK). */
export function checkAndroidBundle(env: AndroidEnvironment, bundle: { capacitorConfig: { server?: { url?: string; hostname?: string } }; marker: Marker | null; text: string },
  specs: Specs = ENVIRONMENTS): string[] {
  const spec = specs[env], failures: string[] = []
  if (bundle.capacitorConfig.server?.url) failures.push('capacitor.config.json sets server.url: the app must load its bundled assets')
  const hostname = bundle.capacitorConfig.server?.hostname ?? 'localhost'
  if (spec.webViewHostname === null) failures.push(HOSTNAME_NOT_APPROVED(env))
  else if (hostname !== spec.webViewHostname) failures.push(`capacitor.config.json WebView hostname is ${hostname}, not ${spec.webViewHostname} (${env})`)
  if (!bundle.marker) failures.push(`${MARKER_FILE} missing: the bundle was not built with --mode android-${env}`)
  else if (bundle.marker.environment !== env || bundle.marker.supabaseProjectRef !== spec.supabaseProjectRef) failures.push(`the bundle was built for ${bundle.marker.environment}, not ${env}`)
  else if (spec.captcha === 'required' && !bundle.marker.captcha) failures.push(`the ${env} bundle has no CAPTCHA site key`)
  const refs = supabaseRefsIn(bundle.text)
  if (refs.length !== 1 || refs[0] !== spec.supabaseProjectRef) failures.push(`Supabase projects in the bundle: ${refs.join(', ') || 'none'}; expected only ${spec.supabaseProjectRef} (${env})`)
  if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(bundle.text)) failures.push('a secret key (sb_secret_…) is in the bundle')
  const jwtRoles = [...bundle.text.matchAll(/eyJ[\w-]{10,}\.(eyJ[\w-]{10,})\.[\w-]+/g)]
    .map((m) => { try { return (JSON.parse(Buffer.from(m[1]!, 'base64url').toString()) as { role?: string }).role } catch { return undefined } })
  if (jwtRoles.includes('service_role')) failures.push('a service_role JWT is in the bundle')
  if (/netlify\.app/.test(bundle.text)) failures.push('the bundle references a Netlify host')
  return failures
}
