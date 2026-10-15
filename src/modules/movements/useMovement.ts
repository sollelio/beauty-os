// The movement flows' offline side (ADR-0010 §3; Offline 6): their lists (server online, the device's snapshot
// offline), the draft named in the URL (?rascunho=…), saving and discarding drafts, and the confirmation of a draft
// online with its stored command id and original capture time. Online flows without a draft are unchanged.
import { useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { listPeople, peopleKeys } from '../org/api'
import { listExpenseCategories, moneyKeys } from '../money/api'
import { listPurchaseOrigins, purchasingKeys } from '../purchasing/api'
import { listProducts, listUnitWords, stockKeys } from '../stock/api'
import { listCapturePeople, listPaymentMethods, servicesKeys } from '../services/api'
import { CAPTURE_SNAPSHOT_MAX_AGE_MS } from '../services/offline'
import { toAppError } from '../../shared/errors'
import { isOfflineMode, offlineKeys, useOfflineRuntime } from '../../shared/offline/runtime'
import {
  beginAttempt, discardDraft, listPendingDrafts, markNotSent, markRejected, markSent, markSubmitted, readDraft, saveDraft,
  type DraftPayload, type FormOf, type MovementDraft,
} from './drafts'
import { readMovementSnapshot, writeMovementSnapshot, type MovementData, type MovementKind } from './snapshot'

export const DRAFT_PARAM = 'rascunho'
export const movementKeys = {
  draft: (id: string) => [...offlineKeys.all, 'draft', id] as const,
  drafts: [...offlineKeys.all, 'drafts'] as const,
}
const LOCAL = { networkMode: 'always', retry: false } as const

export type MovementBlock = 'missing' | 'stale' | 'unavailable'
export type MovementView = { offline: boolean; loading: boolean; blocked: MovementBlock | null; data: Partial<MovementData> }

/** The lists one movement needs: online as before (and kept for offline use), offline from the device only. */
export function useMovementData(kind: MovementKind): MovementView {
  const runtime = useOfflineRuntime()
  const offline = isOfflineMode(runtime)
  const access = runtime.storeAccess
  const on = (k: MovementKind[]) => !offline && k.includes(kind)
  const people = useQuery({ queryKey: servicesKeys.people, queryFn: listCapturePeople, enabled: on(['advance']) })
  const methods = useQuery({ queryKey: servicesKeys.paymentMethods, queryFn: listPaymentMethods, enabled: on(['advance', 'expense']) })
  const categories = useQuery({ queryKey: moneyKeys.categories, queryFn: listExpenseCategories, enabled: on(['expense']) })
  const products = useQuery({ queryKey: stockKeys.products, queryFn: listProducts, enabled: on(['purchase']) })
  const units = useQuery({ queryKey: stockKeys.unitWords, queryFn: listUnitWords, enabled: on(['purchase']) })
  const contributors = useQuery({ queryKey: peopleKeys.all, queryFn: listPeople, enabled: on(['purchase']) })
  const origins = useQuery({ queryKey: purchasingKeys.origins, queryFn: listPurchaseOrigins, enabled: on(['purchase']) })
  const snapshot = useQuery({
    queryKey: [...(access ? offlineKeys.snapshot(access.partition) : [...offlineKeys.all, 'snapshot', 'none']), kind],
    queryFn: async () => readMovementSnapshot(await access!.getStore(), kind),
    enabled: offline && !!access, ...LOCAL, staleTime: 0,
  })

  // after a successful online load, keep this movement's own lists for offline drafts
  useEffect(() => {
    if (offline || !access) return
    const data = kind === 'expense' ? (categories.data ? { expenseCategories: categories.data } : null)
      : kind === 'purchase' ? (products.data && units.data && contributors.data && origins.data
        ? { products: products.data, unitWords: units.data, purchasePeople: contributors.data, purchaseOrigins: origins.data } : null)
      : null                                                    // Adiantamento's lists are the Registar serviço snapshot's
    if (data) void access.getStore().then((s) => writeMovementSnapshot(s, data)).catch(() => { /* the previous snapshot stays */ })
  }, [offline, access, kind, categories.data, products.data, units.data, contributors.data, origins.data])

  if (!offline) {
    return {
      offline, blocked: null,
      loading: kind === 'advance' ? people.isPending || methods.isPending : kind === 'expense' ? categories.isPending || methods.isPending
        : products.isPending || units.isPending || contributors.isPending || origins.isPending,
      data: { people: people.data, paymentMethods: methods.data, expenseCategories: categories.data, products: products.data,
        unitWords: units.data, purchasePeople: contributors.data, purchaseOrigins: origins.data },
    }
  }
  if (!access || runtime.storage === 'unavailable' || snapshot.isError) return { offline, loading: false, blocked: 'unavailable', data: {} }
  if (snapshot.isPending) return { offline, loading: true, blocked: null, data: {} }
  if (snapshot.data.state !== 'ok') return { offline, loading: false, blocked: snapshot.data.state, data: {} }
  return { offline, loading: false, blocked: null, data: snapshot.data.data }
}

/** The draft the URL names (?rascunho=…), if any. */
export function useDraftParam<K extends MovementKind>(kind: K) {
  const [sp] = useSearchParams()
  const draftId = sp.get(DRAFT_PARAM)
  const access = useOfflineRuntime().storeAccess
  const q = useQuery({
    queryKey: movementKeys.draft(draftId ?? 'none'),
    queryFn: async () => readDraft(await access!.getStore(), draftId!, kind),
    enabled: !!draftId && !!access, ...LOCAL, staleTime: Infinity,
  })
  const status: 'none' | 'loading' | 'ready' | 'missing' = !draftId ? 'none' : !access ? 'missing'
    : q.isPending ? 'loading' : q.data && q.data.state === 'draft' ? 'ready' : 'missing'
  return { draftId, status, draft: status === 'ready' ? (q.data as MovementDraft<K>) : null }
}

/** The drafts waiting for a PIN confirmation (identification only). */
export function usePendingDrafts() {
  const access = useOfflineRuntime().storeAccess
  return useQuery({
    queryKey: [...movementKeys.drafts, access?.partition.organizationId ?? '', access?.partition.deviceUserId ?? ''],
    queryFn: async () => listPendingDrafts(await access!.getStore()),
    enabled: !!access, ...LOCAL, staleTime: 0,
  })
}

/** Saving, discarding and confirming one movement's draft. */
export function useDraftActions<K extends MovementKind>(kind: K, draft: MovementDraft<K> | null) {
  const queryClient = useQueryClient()
  const { storeAccess, refresh, requestPersistence } = useOfflineRuntime()
  const store = useCallback(async () => {
    if (!storeAccess) throw new Error('STORAGE_UNAVAILABLE')
    return storeAccess.getStore()
  }, [storeAccess])
  const refreshAll = useCallback(async (id?: string) => {
    await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: movementKeys.drafts }),
      id ? queryClient.invalidateQueries({ queryKey: movementKeys.draft(id) }) : null])
  }, [refresh, queryClient])

  const save = useMutation({
    networkMode: 'always',                                         // local work: never paused for lack of a connection
    mutationFn: async ({ form, display }: { form: FormOf<K>; display: DraftPayload['display'] }) => {
      const s = await store()
      const saved = await saveDraft(s, kind, form, display, draft?.draftId ?? null)
      if ((await s.meta.get('storagePersistGranted')) === null) void requestPersistence()   // once per device partition
      return saved
    },
    onSuccess: (d) => refreshAll(d.draftId),
  })

  const discard = useMutation({
    networkMode: 'always',
    mutationFn: async () => { if (draft) await discardDraft(await store(), draft.draftId) },
    onSuccess: async () => {
      await refreshAll()                         // counts and list; this screen leaves first, then forgets the draft
      if (draft) setTimeout(() => queryClient.removeQueries({ queryKey: movementKeys.draft(draft.draftId) }), 0)
    },
  })

  /**
   * For useVerifiedCommand: the draft's stored command id for this content (none without a draft). The server owns the
   * 48-hour window (CAPTURE_TIME_TOO_OLD / _IN_FUTURE). A local pre-check runs only with a known server-time offset
   * (device time + lastServerTimeOffsetMs ≈ server time); without one the phone's clock alone never blocks — the
   * command goes to the server, which decides. The captured time itself is never changed.
   */
  const intent = draft ? async (input: unknown) => {
    const s = await store()
    const offset = await s.meta.get('lastServerTimeOffsetMs').catch(() => null)
    if (offset !== null && Date.now() + offset - Date.parse(draft.capturedAt) > CAPTURE_SNAPSHOT_MAX_AGE_MS) {
      await markRejected(s, draft.draftId, 'CAPTURE_TIME_TOO_OLD')                // estimated server time: for review
      await refreshAll(draft.draftId)
      throw toAppError({ message: 'CAPTURE_TIME_TOO_OLD' })
    }
    return beginAttempt(s, draft.draftId, JSON.stringify(input))
  } : undefined

  /** The command for useVerifiedCommand: with a draft, its capture time, and every outcome kept on the draft. */
  function wrapRun<I, R>(rpc: (commandId: string, grantId: string, input: I, occurredAt?: string) => Promise<R>) {
    if (!draft) return (commandId: string, grantId: string, input: I) => rpc(commandId, grantId, input)
    return async (commandId: string, grantId: string, input: I): Promise<R> => {
      const s = await store()
      await markSent(s, draft.draftId)
      try {
        const result = await rpc(commandId, grantId, input, draft.capturedAt)
        await markSubmitted(s, draft.draftId)
        await refreshAll()                       // lists and counts only: this screen goes on to its success state
        return result
      } catch (e) {
        const err = toAppError(e)
        if (err.kind === 'domain' && err.code === 'VERIFICATION_REQUIRED') await markNotSent(s, draft.draftId)
        else if (err.kind === 'domain') { await markRejected(s, draft.draftId, err.code ?? 'DOMAIN'); await refreshAll(draft.draftId) }
        // network / unexpected: the outcome is unknown — the stored command id stays for the retry
        throw e
      }
    }
  }

  return { save, discard, intent, wrapRun }
}
