// Pilot hardening 01: operator procedures (private schema) are unreachable from browser principals.
import { describe, expect, it } from 'vitest'
import { client, device } from './env'

const PROCS = ['admin_issue_enrollment_code', 'admin_revoke_device', 'admin_set_person_secret', 'admin_set_permission',
  'admin_create_period', 'admin_set_rule', 'admin_list_devices', 'cleanup_unbound_anonymous_users']

describe('operator procedures', () => {
  it('are not callable by an enrolled device, an unbound anonymous user or the anon key', async () => {
    const enrolled = await device('TEST-ORG-A-2026')
    for (const c of [enrolled, client()]) {
      for (const fn of PROCS) {
        const r = await c.rpc(fn, {})
        expect(r.error, fn).not.toBeNull()
        expect(r.error?.code, fn).toBe('PGRST202')          // not exposed through the API at all
      }
    }
    expect((await enrolled.schema('private' as never).from('security_audit').select('*')).error).not.toBeNull()
  })
})
