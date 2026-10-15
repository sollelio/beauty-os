// The device identity as the app shell needs it before anything else (ADR-0010 §6; Offline 4): the device principal
// (known without a network) and the last-known operational binding of that principal.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { readBinding } from './binding'
import { openSharedOfflineDb } from './db'
import { offlineKeys } from './runtime'

/** Reports the device principal now and on every change; returns the unsubscribe. */
export type PrincipalWatcher = (onChange: (deviceUserId: string | null) => void) => () => void

/** The device principal: the stored value at once (so an offline start is not blocked), then the watcher's. */
export function useDevicePrincipal(watch: PrincipalWatcher, initial: () => string | null): string | null {
  const [principal, setPrincipal] = useState<string | null>(initial)
  useEffect(() => watch(setPrincipal), [watch])
  return principal
}

/** The cached binding of this principal (null when none, or when device storage cannot be read). */
export function useCachedBinding(principal: string | null, enabled: boolean, openDb: () => Promise<IDBDatabase> = openSharedOfflineDb) {
  return useQuery({
    queryKey: offlineKeys.binding(principal ?? 'none'),
    queryFn: async () => {
      try { return await readBinding(await openDb(), principal!) } catch { return null }
    },
    enabled: enabled && !!principal, networkMode: 'always', retry: false, staleTime: Infinity,
  })
}
