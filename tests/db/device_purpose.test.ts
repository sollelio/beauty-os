// ADR-0010 §5 amendment, Slice 1 · device purpose, as a browser session sees it. Every device enrolled through the
// normal path is operational (offline capture and the period-sync guard exactly as before). Only the operator procedure
// makes a support device, so the support paths are checked in tests/sql/device_purpose_probe.sql (Dev, rolled back);
// that the procedure is unreachable from browser principals is in pilot.test.ts.
import { describe, expect, it } from 'vitest'
import { A, device } from './env'

describe('device purpose', () => {
  it('an enrolled device is operational, and its context says so next to the organization', async () => {
    const d = await device('TEST-ORG-A-2026')
    const ctx = (await d.rpc('device_context')).data as { bound: boolean; organization: { id: string }; device: { purpose: string } }
    expect(ctx.bound).toBe(true)
    expect(ctx.organization.id).toBe(A.org)
    expect(ctx.device).toEqual({ purpose: 'operational' })
    const r = await d.rpc('report_device_sync', { p_report: { days: [], undated: {} } })
    expect(r.error, r.error?.message).toBeNull()
    expect(Object.keys(r.data as object)).toEqual(['reported_at'])                       // an operational report, as before
  })
})
