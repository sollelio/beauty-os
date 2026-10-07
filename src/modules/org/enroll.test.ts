import { describe, expect, it, vi, beforeEach } from 'vitest'

const auth = { getSession: vi.fn(), signInAnonymously: vi.fn(), signOut: vi.fn() }
const rpc = vi.fn()
vi.mock('../../shared/supabase/client', () => ({ getSupabase: () => ({ auth, rpc }) }))
import { enrollDevice } from './api'

beforeEach(() => { vi.resetAllMocks(); auth.signInAnonymously.mockResolvedValue({ error: null }); auth.signOut.mockResolvedValue({ error: null }) })

describe('enrollDevice', () => {
  it('signs in anonymously with the CAPTCHA token when one is given, then redeems the code', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } })
    rpc.mockResolvedValue({ data: { ok: true }, error: null })
    await enrollDevice('ABCD-EFGH-JKLM', 'tok')
    expect(auth.signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: 'tok' } })
    expect(rpc).toHaveBeenCalledWith('redeem_enrollment', { p_code: 'ABCD-EFGH-JKLM' })
  })
  it('without a site key the sign-in carries no CAPTCHA options', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } })
    rpc.mockResolvedValue({ data: { ok: true }, error: null })
    await enrollDevice('ABCD-EFGH-JKLM')
    expect(auth.signInAnonymously).toHaveBeenCalledWith(undefined)
  })
  it('a browser bound to a revoked device gets a fresh identity and enrolls again', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'x' } } })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'ALREADY_BOUND', code: 'P0001' } }).mockResolvedValueOnce({ data: { ok: true }, error: null })
    await enrollDevice('ABCD-EFGH-JKLM')
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(2)
  })
  it('an invalid code is reported, not retried', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'x' } } })
    rpc.mockResolvedValue({ data: null, error: { message: 'ENROLLMENT_INVALID', code: 'P0001' } })
    await expect(enrollDevice('NOPE')).rejects.toMatchObject({ code: 'ENROLLMENT_INVALID' })
    expect(auth.signOut).not.toHaveBeenCalled()
  })
})
