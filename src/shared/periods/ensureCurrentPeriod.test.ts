import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('../supabase/client', () => ({ getSupabase: () => ({ rpc }) }))
import { ensureCurrentPeriod, resetEnsureCurrentPeriod, withCurrentPeriod } from './ensureCurrentPeriod'

beforeEach(() => { rpc.mockReset(); resetEnsureCurrentPeriod() })

describe('ensure the current period before a default-period read', () => {
  it('asks the server once, then not again for a few minutes', async () => {
    rpc.mockResolvedValue({ data: { ensured: true }, error: null })
    await ensureCurrentPeriod(0)
    await ensureCurrentPeriod(60_000)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('ensure_current_period')
    await ensureCurrentPeriod(6 * 60_000)
    expect(rpc).toHaveBeenCalledTimes(2)
  })
  it('a failure (offline, an older database) never blocks the read, and is retried next time', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Could not find the function' } }).mockRejectedValueOnce(new TypeError('fetch failed'))
    const read = vi.fn().mockResolvedValue('figures')
    expect(await withCurrentPeriod(null, read)).toBe('figures')
    expect(await withCurrentPeriod(null, read)).toBe('figures')
    expect(rpc).toHaveBeenCalledTimes(2)
  })
  it('only the default (null) period needs it; a chosen period is read as is', async () => {
    const read = vi.fn().mockResolvedValue('figures')
    await withCurrentPeriod('p44', read)
    expect(rpc).not.toHaveBeenCalled()
    expect(read).toHaveBeenCalledTimes(1)
  })
})
