// ADR-0010 §5 amendment, Slice 2 · operational week end, as a real session sees it on an organization WITHOUT a schedule
// (every organization until an operator sets one): the review and the sync status say it is not available, the commands
// refuse, and nothing else changes. The schedule-dependent rules (declaring on the last operating day, early, the
// freeze, withdrawal, the guard's end) are checked in tests/sql/week_end_probe.sql (Dev, rolled back), since a schedule
// is set only by an operator and the rules depend on today's date.
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { client, device } from './env'

type Row = Record<string, any>                                  // eslint-disable-line @typescript-eslint/no-explicit-any
const MANAGER = '00000000-0000-4000-8000-0000000096b2', PIN = '969696'   // Teste Offline Sync (seed 19): period.decide, team.finance.read

describe('operational week end without a schedule', () => {
  it('is not available: the review and the status say so, declaring and withdrawing refuse, and the anon key cannot call them', async () => {
    const d = await device('TEST-ORG-SYNC-2026')
    expect((await d.rpc('verify_person', { p_person_id: MANAGER, p_secret: PIN, p_scope: 'private_session' })).data?.ok).toBe(true)
    const p = ((await d.rpc('fecho_periods')).data as Row[]).filter((x) => x.label.startsWith('Sync 2025') && x.state === 'aberto').at(-1)!
    const review = (await d.rpc('fecho_period', { p_period_id: p.id })).data as Row
    expect(review.week_end).toMatchObject({ available: false, declared: null, can_declare: false, can_withdraw: false, last_operating_day: null })
    const status = (await d.rpc('fecho_sync_status', { p_period_id: p.id })).data as Row
    expect(status.week_end).toEqual({ available: false, declared_at: null })
    const grant = async () => ((await d.rpc('verify_person', { p_person_id: MANAGER, p_secret: PIN })).data as Row).grant_id as string
    expect((await d.rpc('declare_week_end', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p.id })).error?.message).toBe('WEEK_END_NOT_AVAILABLE')
    expect((await d.rpc('withdraw_week_end', { p_command_id: randomUUID(), p_grant_id: await grant(), p_period_id: p.id })).error?.message).toBe('WEEK_NOT_ENDED')
    expect((await d.rpc('declare_week_end', { p_command_id: randomUUID(), p_grant_id: null, p_period_id: p.id })).error?.message).toBe('VERIFICATION_REQUIRED')
    expect((await client().rpc('declare_week_end', { p_command_id: randomUUID(), p_grant_id: randomUUID(), p_period_id: p.id })).error?.code).toBe('42501')
    expect((await d.rpc('fecho_history', { p_period_id: p.id })).data.filter((h: Row) => String(h.kind).startsWith('week_end'))).toEqual([])
    await d.rpc('report_device_sync', { p_report: { days: [], undated: {} } })   // leave this test device ready, like the sync tests do
  })
})
