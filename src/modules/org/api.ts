// Module `org` access layer: device session, enrollment, device context (ADR-0009).
import { getSupabase } from '../../shared/supabase/client'
import { toAppError } from '../../shared/errors'

export type Organization = {
  id: string; name: string; timezone: string
  currency_code: string; currency_exponent: number; currency_symbol: string
}
export type DeviceContext = { bound: false } | { bound: true; organization: Organization }

export const orgKeys = { deviceContext: ['org', 'device-context'] as const }

export async function getDeviceContext(): Promise<DeviceContext> {
  const sb = getSupabase()
  const { data: session } = await sb.auth.getSession()
  if (!session.session) return { bound: false }
  const { data, error } = await sb.rpc('device_context')
  if (error) throw toAppError(error)
  return data as DeviceContext
}

/** Development enrollment: the device signs in anonymously (once) and redeems an enrollment code. */
export async function enrollDevice(code: string): Promise<void> {
  const sb = getSupabase()
  const { data: session } = await sb.auth.getSession()
  if (!session.session) {
    const { error } = await sb.auth.signInAnonymously()
    if (error) throw toAppError(error)
  }
  const { error } = await sb.rpc('redeem_enrollment', { p_code: code })
  if (error) throw toAppError(error)
}

export type Confirmer = { id: string; display_name: string }

export const verificationKeys = { confirmers: ['org', 'confirmers'] as const }

export async function listConfirmers(): Promise<Confirmer[]> {
  const { data, error } = await getSupabase().rpc('list_confirmers')
  if (error) throw toAppError(error)
  return data as Confirmer[]
}

/** Server-side verification of a person's secret (ADR-0009). Creates a one-shot grant for this device session. */
export async function verifyPerson(personId: string, secret: string): Promise<void> {
  const { data, error } = await getSupabase().rpc('verify_person', { p_person_id: personId, p_secret: secret })
  if (error) throw toAppError(error)
  const r = data as { ok: boolean; error?: string }
  if (!r.ok) throw toAppError({ message: r.error ?? 'NOT_AUTHORIZED' })
}
