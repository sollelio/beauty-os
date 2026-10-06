import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AppError } from '../../shared/errors'

vi.mock('./api', async (orig) => {
  const actual = await orig<typeof import('./api')>()
  return { ...actual, recordService: vi.fn(), getHojeSummary: vi.fn() }
})
import { recordService, getHojeSummary, servicesKeys, type RecordServiceInput } from './api'
import { useRecordService } from './useRecordService'

const input: RecordServiceInput = { personId: 'p', serviceId: 's', valueMinor: 350000, payments: [{ method_id: 'm', amount_minor: 350000 }] }

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => vi.mocked(recordService).mockReset())

describe('useRecordService', () => {
  it('retries a failed save with the same command_id', async () => {
    vi.mocked(recordService)
      .mockRejectedValueOnce(new AppError('network', 'Failed to fetch'))
      .mockResolvedValueOnce({ record_id: 'r1', occurred_at: new Date().toISOString() })
    const { result } = renderHook(() => useRecordService(), { wrapper: wrapper() })
    act(() => result.current.submit(input))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.kind).toBe('network')
    act(() => result.current.submit({ ...input }))
    await waitFor(() => expect(result.current.status).toBe('success'))
    const [first, second] = vi.mocked(recordService).mock.calls
    expect(first![0]).toBe(second![0])
  })

  it('uses a new command_id for a changed input and after reset', () => {
    const { result } = renderHook(() => useRecordService(), { wrapper: wrapper() })
    const a = result.current.commandIdFor(input)
    expect(result.current.commandIdFor({ ...input })).toBe(a)
    const b = result.current.commandIdFor({ ...input, valueMinor: 400000, payments: [{ method_id: 'm', amount_minor: 400000 }] })
    expect(b).not.toBe(a)
    act(() => result.current.reset())
    expect(result.current.commandIdFor(input)).not.toBe(a)
  })

  it('refreshes Hoje after a successful save', async () => {
    vi.mocked(getHojeSummary).mockResolvedValue({ total: 0, last_at: null, by_method: [], recent: [] })
    vi.mocked(recordService).mockResolvedValueOnce({ record_id: 'r2', occurred_at: new Date().toISOString() })
    const { result } = renderHook(() => ({
      hoje: useQuery({ queryKey: servicesKeys.hoje, queryFn: getHojeSummary }),
      record: useRecordService(),
    }), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.hoje.isSuccess).toBe(true))
    expect(getHojeSummary).toHaveBeenCalledTimes(1)
    act(() => result.current.record.submit(input))
    await waitFor(() => expect(getHojeSummary).toHaveBeenCalledTimes(2))
  })
})
