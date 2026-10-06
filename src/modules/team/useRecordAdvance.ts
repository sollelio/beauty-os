// Sensitive command: verify the confirming person (one-shot grant), then record with one command_id per intent.
// A network failure keeps the grant and the command_id, so "Tentar novamente" replays safely (ADR-0006, ADR-0009).
import { useCallback, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { newCommandId } from '../../shared/commandId'
import { toAppError } from '../../shared/errors'
import { verifyPerson } from '../org/api'
import { recordAdvance, type RecordAdvanceInput } from './api'

export type ConfirmArgs = { input: RecordAdvanceInput; confirmerId: string; secret: string }

export function useRecordAdvance() {
  const intent = useRef<{ id: string; key: string } | null>(null)
  const verifiedFor = useRef<string | null>(null)   // confirmer whose one-shot grant is (believed) still unused

  const commandIdFor = useCallback((input: RecordAdvanceInput) => {
    const key = JSON.stringify(input)
    if (!intent.current || intent.current.key !== key) intent.current = { id: newCommandId(), key }
    return intent.current.id
  }, [])

  const mutation = useMutation({
    mutationFn: async ({ input, confirmerId, secret }: ConfirmArgs) => {
      const id = commandIdFor(input)
      if (verifiedFor.current !== confirmerId) {
        await verifyPerson(confirmerId, secret)
        verifiedFor.current = confirmerId
      }
      try {
        return await recordAdvance(id, input)
      } catch (e) {
        const err = toAppError(e)
        if (err.code !== 'VERIFICATION_REQUIRED') throw err
        verifiedFor.current = null                    // grant expired or used: verify once more, same command_id
        await verifyPerson(confirmerId, secret)
        verifiedFor.current = confirmerId
        return await recordAdvance(id, input)
      }
    },
    onSuccess: () => { verifiedFor.current = null },
  })

  const reset = useCallback(() => {
    intent.current = null
    verifiedFor.current = null
    mutation.reset()
  }, [mutation])

  return {
    confirm: mutation.mutate,
    status: mutation.status,
    result: mutation.data,
    error: mutation.error ? toAppError(mutation.error) : null,
    commandIdFor,
    reset,
  }
}
