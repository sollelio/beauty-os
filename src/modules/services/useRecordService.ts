// One command_id per user intent (ADR-0006): retries of the same input reuse it; a changed input or reset() starts a new intent.
import { useCallback, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { newCommandId } from '../../shared/commandId'
import { toAppError } from '../../shared/errors'
import { recordService, servicesKeys, type RecordServiceInput } from './api'

export function useRecordService() {
  const queryClient = useQueryClient()
  const intent = useRef<{ id: string; key: string } | null>(null)

  const commandIdFor = useCallback((input: RecordServiceInput): string => {
    const key = JSON.stringify(input)
    if (!intent.current || intent.current.key !== key) intent.current = { id: newCommandId(), key }
    return intent.current.id
  }, [])

  const mutation = useMutation({
    mutationFn: (input: RecordServiceInput) => recordService(commandIdFor(input), input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: servicesKeys.all }),
  })

  const reset = useCallback(() => {
    intent.current = null
    mutation.reset()
  }, [mutation])

  return {
    submit: mutation.mutate,
    status: mutation.status,
    result: mutation.data,
    error: mutation.error ? toAppError(mutation.error) : null,
    commandIdFor,
    reset,
  }
}
