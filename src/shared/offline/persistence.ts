// navigator.storage.persist() (ADR-0010 §8): asked for only when a caller explicitly does so (not at app start). The
// browser may refuse, or not offer the API; neither is an error, and `granted` is not a durability promise — device
// storage can still be lost (Offline 8 hardening).
export type PersistResult = 'granted' | 'denied' | 'unavailable'

type StorageNavigator = { storage?: { persist?: () => Promise<boolean> } }

export async function requestPersistentStorage(nav: StorageNavigator | undefined = globalThis.navigator): Promise<PersistResult> {
  const storage = nav?.storage
  if (!storage || typeof storage.persist !== 'function') return 'unavailable'
  try {
    return (await storage.persist()) ? 'granted' : 'denied'
  } catch {
    return 'unavailable'
  }
}
