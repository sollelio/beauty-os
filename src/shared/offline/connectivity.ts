// Connectivity as the browser reports it (ADR-0010 §9, §11). navigator.onLine is a signal, not proof that the server
// is reachable: "online" can still fail, and a failed request keeps its own error handling. No probing, no polling.
import { useSyncExternalStore } from 'react'

export type Connectivity = 'online' | 'offline'

type ConnectivityWindow = Pick<Window, 'addEventListener' | 'removeEventListener'> & { navigator: { onLine: boolean } }
const browser = (): ConnectivityWindow | undefined => (typeof window === 'undefined' ? undefined : window)

/** Unknown (no navigator) counts as online: nothing is ever blocked on a missing signal. */
export function getConnectivity(w: ConnectivityWindow | undefined = browser()): Connectivity {
  return w?.navigator.onLine === false ? 'offline' : 'online'
}

export function subscribeConnectivity(onChange: () => void, w: ConnectivityWindow | undefined = browser()): () => void {
  if (!w) return () => {}
  w.addEventListener('online', onChange)
  w.addEventListener('offline', onChange)
  return () => {
    w.removeEventListener('online', onChange)
    w.removeEventListener('offline', onChange)
  }
}

export function useConnectivity(): Connectivity {
  return useSyncExternalStore(subscribeConnectivity, getConnectivity, () => 'online')
}
