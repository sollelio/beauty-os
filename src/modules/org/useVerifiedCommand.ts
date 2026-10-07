// Sensitive commands (ADR-0009): verify the confirming person (one-shot grant), then run the command with one
// command_id per intent (ADR-0006). The grant id is kept together with the confirmer and presented on retry; the
// server consumes only that exact grant. If it is no longer valid (expired, used, or superseded by anyone's later
// verification) the command returns VERIFICATION_REQUIRED and the same confirmer is verified again — another
// person's verification can never authorize this retry. An already-committed command replays without a grant.
import { useCallback, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { newCommandId } from '../../shared/commandId'
import { toAppError } from '../../shared/errors'
import { verifyPerson } from './api'

export type VerifiedArgs<I> = { input: I; confirmerId: string; secret: string }

export function useVerifiedCommand<I, R>(run: (commandId: string, grantId: string, input: I) => Promise<R>) {
  const intent = useRef<{ id: string; key: string } | null>(null)
  const grant = useRef<{ confirmerId: string; grantId: string } | null>(null)

  const commandIdFor = useCallback((input: I) => {
    const key = JSON.stringify(input)
    if (!intent.current || intent.current.key !== key) intent.current = { id: newCommandId(), key }
    return intent.current.id
  }, [])

  const mutation = useMutation({
    mutationFn: async ({ input, confirmerId, secret }: VerifiedArgs<I>) => {
      const id = commandIdFor(input)
      const verify = async () => {
        grant.current = null
        grant.current = { confirmerId, grantId: await verifyPerson(confirmerId, secret) }
        return grant.current.grantId
      }
      const grantId = grant.current?.confirmerId === confirmerId ? grant.current.grantId : await verify()
      try {
        return await run(id, grantId, input)
      } catch (e) {
        const err = toAppError(e)
        if (err.code !== 'VERIFICATION_REQUIRED') throw err
        return await run(id, await verify(), input)
      }
    },
    onSuccess: () => { grant.current = null },
  })

  const reset = useCallback(() => {
    intent.current = null
    grant.current = null
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
