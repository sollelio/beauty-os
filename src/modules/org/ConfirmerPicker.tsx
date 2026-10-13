// "Quem confirma?" + PIN inside a Confirmação necessária boundary (ADR-0009): the people who hold the boundary's
// permission, presented by PinConfirm (the shared person/PIN pattern, also used to enter the private area).
import { useQuery } from '@tanstack/react-query'
import type { AppError } from '../../shared/errors'
import { listConfirmers, verificationKeys, type ConfirmPermission } from './api'
import { PinConfirm } from './PinConfirm'

export function ConfirmerPicker({ confirmerId, onConfirmer, secret, onSecret, permission = 'movement.confirm', error, messages }: {
  confirmerId: string | null; onConfirmer: (id: string) => void; secret: string; onSecret: (s: string) => void; permission?: ConfirmPermission
  error?: AppError | null; messages?: Record<string, string>
}) {
  const confirmers = useQuery({ queryKey: verificationKeys.confirmers(permission), queryFn: () => listConfirmers(permission) })
  return (
    <PinConfirm legend="Quem confirma?" people={confirmers.data} loading={confirmers.isPending} emptyText="Nenhuma pessoa autorizada configurada."
      personId={confirmerId} onPerson={onConfirmer} secret={secret} onSecret={onSecret} error={error} messages={messages} />
  )
}
