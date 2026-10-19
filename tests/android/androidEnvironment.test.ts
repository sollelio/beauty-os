// @vitest-environment node
// Android R2 · environment separation: an Android build is refused unless it points at its own Supabase project, and a
// synced bundle passes only for the environment it was built for (Dev never ships as prod, nor the reverse).
import { describe, expect, it } from 'vitest'
import { androidEnvironmentOf, checkAndroidBundle, ENVIRONMENTS, validateAndroidEnv } from '../../scripts/androidEnvironment'

const DEV = ENVIRONMENTS.dev.supabaseProjectRef, PROD = ENVIRONMENTS.prod.supabaseProjectRef
const url = (ref: string) => `https://${ref}.supabase.co`
const key = 'sb_publishable_example'
// as prod will be once its WebView hostname is approved (it is not yet: ENVIRONMENTS.prod refuses every build)
const APPROVED = { ...ENVIRONMENTS, prod: { ...ENVIRONMENTS.prod, webViewHostname: 'app.example.test' } }
const prodVars = { VITE_SUPABASE_URL: url(PROD), VITE_SUPABASE_PUBLISHABLE_KEY: key, VITE_TURNSTILE_SITE_KEY: 'site' }

describe('Android environments', () => {
  it('two identities, two Supabase projects', () => {
    expect(ENVIRONMENTS.prod).toMatchObject({ applicationId: 'com.sollelio.beautyos', appName: 'Beauty OS', captcha: 'required' })
    expect(ENVIRONMENTS.dev).toMatchObject({ applicationId: 'com.sollelio.beautyos.dev', appName: 'Beauty OS Dev', webViewHostname: 'localhost' })
    expect(ENVIRONMENTS.prod.webViewHostname).toBeNull()                 // not approved yet
    expect(DEV).not.toBe(PROD)
  })
  it('only android-dev and android-prod are Android builds; the web build is not', () => {
    expect(androidEnvironmentOf('android-dev')).toBe('dev')
    expect(androidEnvironmentOf('android-prod')).toBe('prod')
    expect(androidEnvironmentOf('production')).toBeNull()
    expect(androidEnvironmentOf('test')).toBeNull()
    expect(() => androidEnvironmentOf('android-staging')).toThrow(/Unknown Android build mode/)
    expect(() => androidEnvironmentOf('android')).toThrow(/Unknown Android build mode/)
  })
})

describe('the build is refused unless it points at its own project', () => {
  it('dev with Dev values; prod with Prod values and CAPTCHA once its hostname is approved', () => {
    expect(validateAndroidEnv('dev', { VITE_SUPABASE_URL: url(DEV), VITE_SUPABASE_PUBLISHABLE_KEY: key }))
      .toEqual({ environment: 'dev', supabaseProjectRef: DEV, captcha: false })
    expect(validateAndroidEnv('prod', prodVars, APPROVED)).toEqual({ environment: 'prod', supabaseProjectRef: PROD, captcha: true })
  })
  it('prod is refused, even with correct values, until its WebView hostname is approved', () => {
    expect(() => validateAndroidEnv('prod', prodVars)).toThrow(/refused until the WebView hostname is approved/)
  })
  it('Dev values in a prod build, and Prod values in a dev build, are refused', () => {
    expect(() => validateAndroidEnv('prod', { ...prodVars, VITE_SUPABASE_URL: url(DEV) }, APPROVED)).toThrow(/must be the prod project/)
    expect(() => validateAndroidEnv('dev', { VITE_SUPABASE_URL: url(PROD), VITE_SUPABASE_PUBLISHABLE_KEY: key })).toThrow(/must be the dev project/)
  })
  it('missing values, a non-publishable key, or prod without CAPTCHA are refused', () => {
    expect(() => validateAndroidEnv('dev', {})).toThrow(/VITE_SUPABASE_URL[\s\S]*VITE_SUPABASE_PUBLISHABLE_KEY/)
    expect(() => validateAndroidEnv('dev', { VITE_SUPABASE_URL: url(DEV), VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toThrow(/publishable key/)
    expect(() => validateAndroidEnv('prod', { ...prodVars, VITE_TURNSTILE_SITE_KEY: '' }, APPROVED)).toThrow(/VITE_TURNSTILE_SITE_KEY is required/)
  })
})

describe('the synced bundle passes only for the environment it was built for', () => {
  const bundle = (ref: string, marker: Parameters<typeof checkAndroidBundle>[1]['marker'], hostname?: string) =>
    ({ capacitorConfig: hostname ? { server: { hostname } } : {}, marker, text: `fetch("${url(ref)}/rest/v1/")` })
  const devMarker = { environment: 'dev' as const, supabaseProjectRef: DEV, captcha: false }
  const prodMarker = { environment: 'prod' as const, supabaseProjectRef: PROD, captcha: true }
  it('a dev bundle passes dev and fails prod; a prod bundle (approved hostname) passes prod and fails dev', () => {
    const dev = bundle(DEV, devMarker), prod = bundle(PROD, prodMarker, 'app.example.test')
    expect(checkAndroidBundle('dev', dev)).toEqual([])
    expect(checkAndroidBundle('prod', prod, APPROVED)).toEqual([])
    expect(checkAndroidBundle('prod', dev, APPROVED).join('\n')).toMatch(/built for dev, not prod[\s\S]*expected only/)
    expect(checkAndroidBundle('dev', prod).join('\n')).toMatch(/hostname is app.example.test, not localhost[\s\S]*built for prod, not dev[\s\S]*expected only/)
  })
  it('prod fails while its hostname is not approved; a hostname other than the approved one fails', () => {
    expect(checkAndroidBundle('prod', bundle(PROD, prodMarker)).join('\n')).toMatch(/refused until the WebView hostname is approved/)
    expect(checkAndroidBundle('prod', bundle(PROD, prodMarker), APPROVED).join('\n')).toMatch(/hostname is localhost, not app.example.test/)
  })
  it('no marker (a plain web build), a remote server.url, a second project or a secret key fail', () => {
    expect(checkAndroidBundle('dev', bundle(DEV, null)).join('\n')).toMatch(/not built with --mode android-dev/)
    expect(checkAndroidBundle('dev', { ...bundle(DEV, devMarker), capacitorConfig: { server: { url: 'https://example.org' } } }))
      .toContain('capacitor.config.json sets server.url: the app must load its bundled assets')
    const mixed = { ...bundle(PROD, prodMarker, 'app.example.test'), text: `${url(PROD)} ${url(DEV)} sb_secret_abcdefghij` }
    expect(checkAndroidBundle('prod', mixed, APPROVED).join('\n')).toMatch(/expected only[\s\S]*secret key/)
  })
})
