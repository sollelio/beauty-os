// The live sync-safety read behind Fecho's gate (Offline 7): this phone reports first, then the period's state.
import { useQuery } from '@tanstack/react-query'
import { fechoKeys, getSyncStatus } from '../../modules/period/api'
import { useOfflineRuntime } from '../../shared/offline/runtime'

export function useSyncGate(periodId: string | undefined) {
  const { reportSyncNow } = useOfflineRuntime()
  const q = useQuery({
    queryKey: fechoKeys.sync(periodId ?? 'none'),
    queryFn: async () => { await reportSyncNow(); return getSyncStatus(periodId!) },
    enabled: !!periodId, staleTime: 0, refetchOnMount: 'always', retry: false,
  })
  return { q, blocked: q.data ? !q.data.safe : false }
}

