// One command_id per user intent (ADR-0006): retries of the same input reuse it; a changed input or reset() starts a new intent.
// Offline (ADR-0010 §9, Offline 4): the intent also fixes its capture time, at the first confirmation; the service is
// stored on this device as one outbox item and sent later with the same command id and time. Nothing is sent to the
// server from here while offline, and no server id exists until it is synchronized.
import { useCallback, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { newCommandId } from '../../shared/commandId'
import { toAppError } from '../../shared/errors'
import { isOfflineMode, useOfflineRuntime } from '../../shared/offline/runtime'
import { recordService, servicesKeys, type RecordServiceInput } from './api'
import { captureSnapshotState, queueService, readCaptureSnapshot } from './offline'

export type QueuedService = { commandId: string; occurredAt: string }
/** Why an offline service was not stored: device storage failed, or the salon data on this device is not usable. */
export type QueueFailure = 'storage' | 'missing' | 'stale'

class QueueError extends Error {
  constructor(readonly reason: QueueFailure) { super(reason) }
}

export function useRecordService() {
  const queryClient = useQueryClient()
  const runtime = useOfflineRuntime()
  const intent = useRef<{ id: string; key: string; occurredAt: string | null } | null>(null)
  const [mode, setMode] = useState<'online' | 'offline'>('online')

  const intentFor = useCallback((input: RecordServiceInput) => {
    const key = JSON.stringify(input)
    if (!intent.current || intent.current.key !== key) intent.current = { id: newCommandId(), key, occurredAt: null }
    return intent.current
  }, [])
  const commandIdFor = useCallback((input: RecordServiceInput): string => intentFor(input).id, [intentFor])

  const mutation = useMutation({
    mutationFn: (input: RecordServiceInput) => recordService(commandIdFor(input), input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: servicesKeys.all }),
  })

  const { storeAccess, refresh, requestPersistence } = runtime
  const queue = useMutation({
    networkMode: 'always',                                  // local work: never paused for lack of a connection
    mutationFn: async (input: RecordServiceInput): Promise<QueuedService> => {
      if (!storeAccess) throw new QueueError('storage')
      const it = intentFor(input)
      it.occurredAt ??= new Date().toISOString()             // captured once, at the first confirmation
      let firstOnDevice = false
      try {
        const store = await storeAccess.getStore()
        const state = captureSnapshotState(await readCaptureSnapshot(store))
        if (state !== 'ok') throw new QueueError(state)
        const item = await queueService(store, it.id, input, it.occurredAt)
        firstOnDevice = (await store.meta.get('storagePersistGranted')) === null
        return { commandId: item.commandId, occurredAt: item.occurredAt }
      } catch (e) {
        throw e instanceof QueueError ? e : new QueueError('storage')
      } finally {
        if (firstOnDevice) void requestPersistence()        // once: the first real offline item on this device
      }
    },
    onSuccess: () => refresh(),
  })

  const submit = useCallback((input: RecordServiceInput, opts?: { onSuccess?: () => void }) => {
    if (isOfflineMode(runtime)) {
      setMode('offline'); mutation.reset()
      queue.mutate(input, { onSuccess: () => opts?.onSuccess?.() })
    } else {
      setMode('online'); queue.reset()
      mutation.mutate(input, { onSuccess: () => opts?.onSuccess?.() })
    }
  }, [runtime, mutation, queue])

  const reset = useCallback(() => {
    intent.current = null
    mutation.reset()
    queue.reset()
  }, [mutation, queue])

  const active = mode === 'offline' ? queue : mutation
  return {
    submit,
    status: active.status,
    result: mode === 'online' ? mutation.data : undefined,
    queued: mode === 'offline' ? queue.data : undefined,
    error: mode === 'online' && mutation.error ? toAppError(mutation.error) : null,
    queueFailure: mode === 'offline' && queue.error instanceof QueueError ? queue.error.reason : null,
    commandIdFor,
    reset,
  }
}
