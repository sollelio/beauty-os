// Module `org` access layer: device session, enrollment, device context (ADR-0009).
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { authStorageKey, getSupabase } from '../../shared/supabase/client'
import { AppError, toAppError } from '../../shared/errors'

export type Organization = {
  id: string; name: string; timezone: string
  currency_code: string; currency_exponent: number; currency_symbol: string
}
export type DeviceContext = { bound: false } | { bound: true; organization: Organization }

export const orgKeys = { deviceContext: ['org', 'device-context'] as const }

export async function getDeviceContext(): Promise<DeviceContext> {
  const sb = getSupabase()
  const { data: session, error: sessionError } = await sb.auth.getSession()
  // an expired session that cannot be refreshed for lack of network is "no connection", never "not bound"
  if (sessionError && isAuthRetryableFetchError(sessionError)) throw new AppError('network', sessionError.message)
  if (!session.session) return { bound: false }
  const { data, error } = await sb.rpc('device_context')
  if (error) throw toAppError(error)
  return data as DeviceContext
}

/**
 * The device principal — this browser's anonymous Supabase user id — now and whenever it changes (sign-in, sign-out,
 * a replaced identity). Read from the locally kept session, so it is known without a connection. It partitions the
 * device's offline storage (ADR-0010 §6). Returns the unsubscribe.
 */
export function watchDevicePrincipal(onChange: (userId: string | null) => void): () => void {
  // offline with an expired access token the client reports no session, but keeps it stored: the stored id still
  // names this browser's identity (it authorizes nothing — the server checks the principal on every command)
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => onChange(session?.user.id ?? readStoredPrincipal()))
  return () => data.subscription.unsubscribe()
}

/** This device's sync report (Offline 7): its own unsent / unconfirmed / to-review counts per day. The server derives
 *  the device and organization from the session. */
export async function reportDeviceSync(report: unknown): Promise<{ reported_at: string }> {
  const { data, error } = await getSupabase().rpc('report_device_sync', { p_report: report })
  if (error) throw toAppError(error)
  return data as { reported_at: string }
}

/** The current session's principal, refreshing the session if needed (online; before a synchronization). */
export async function getSessionPrincipal(): Promise<string | null> {
  const { data, error } = await getSupabase().auth.getSession()
  if (error && isAuthRetryableFetchError(error)) throw new AppError('network', error.message)
  return data.session?.user.id ?? null
}

/** The user id of the session kept in this browser, read without a network; null when there is none. */
export function readStoredPrincipal(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): string | null {
  try {
    const raw = storage?.getItem(authStorageKey())
    const id = raw ? (JSON.parse(raw) as { user?: { id?: unknown } }).user?.id : null
    return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id : null
  } catch {
    return null
  }
}

/**
 * Enrollment (ADR-0009): the device signs in anonymously (once) and redeems an operator-issued code. Where Auth
 * CAPTCHA is enabled the anonymous sign-in carries a Turnstile token (mitigation 4). A browser whose earlier
 * binding was revoked (lost/replaced device) starts a fresh anonymous identity and enrolls again (mitigation 5).
 */
export async function enrollDevice(code: string, captchaToken?: string): Promise<void> {
  const sb = getSupabase()
  const signIn = async () => {
    const { error } = await sb.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined)
    if (error) throw toAppError(error)
  }
  const { data: session } = await sb.auth.getSession()
  if (!session.session) await signIn()
  let { error } = await sb.rpc('redeem_enrollment', { p_code: code })
  if (error && toAppError(error).code === 'ALREADY_BOUND' && session.session) {
    // this browser's identity is bound to a revoked device (the app shows it as unbound): replace the identity
    await sb.auth.signOut({ scope: 'local' })
    await signIn()
    ;({ error } = await sb.rpc('redeem_enrollment', { p_code: code }))
  }
  if (error) throw toAppError(error)
}

export type Confirmer = { id: string; display_name: string }

export type ConfirmPermission = 'movement.confirm' | 'period.decide' | 'payment.confirm' | 'period.close' | 'period.reopen' | 'records.correct' | 'catalogue.manage'
export const verificationKeys = { confirmers: (permission: ConfirmPermission = 'movement.confirm') => ['org', 'confirmers', permission] as const }

/** People who may confirm a boundary (names only), for the boundary's permission (07 §8 B2, B5–B7). */
export async function listConfirmers(permission: ConfirmPermission = 'movement.confirm'): Promise<Confirmer[]> {
  const { data, error } = await getSupabase().rpc('list_confirmers', { p_permission: permission })
  if (error) throw toAppError(error)
  return data as Confirmer[]
}

/**
 * Server-side verification of a person's secret (ADR-0009). Returns the id of the one-shot grant created for
 * this device session; the sensitive command must present exactly this id.
 */
export async function verifyPerson(personId: string, secret: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('verify_person', { p_person_id: personId, p_secret: secret })
  if (error) throw toAppError(error)
  const r = data as { ok: boolean; error?: string; grant_id?: string }
  if (!r.ok || !r.grant_id) throw toAppError({ message: r.error ?? 'NOT_AUTHORIZED' })
  return r.grant_id
}

export type PersonRow = { id: string; display_name: string }
export const peopleKeys = { all: ['org', 'people'] as const }

/** Active people of this organization (operational names only). */
export async function listPeople(): Promise<PersonRow[]> {
  const { data, error } = await getSupabase().from('people').select('id, display_name').eq('active', true).order('display_name')
  if (error) throw toAppError(error)
  return data
}
