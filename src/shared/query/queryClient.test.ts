// Offline 8 · commands are never paused waiting for a connection and sent later by themselves.
import { onlineManager } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from './queryClient'

afterEach(() => onlineManager.setOnline(true))

describe('query client', () => {
  it('a command started while the library believes the device is offline runs (and fails) now — it is not paused', async () => {
    const qc = createQueryClient()
    onlineManager.setOnline(false)
    const run = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    const m = qc.getMutationCache().build(qc, { mutationFn: run })
    await expect(m.execute(undefined)).rejects.toThrow('Failed to fetch')
    expect(run).toHaveBeenCalledTimes(1)
    expect(m.state).toMatchObject({ status: 'error', isPaused: false })
    onlineManager.setOnline(true)                                         // connectivity returns: nothing is replayed
    await new Promise((r) => setTimeout(r, 10))
    expect(run).toHaveBeenCalledTimes(1)
  })
})
