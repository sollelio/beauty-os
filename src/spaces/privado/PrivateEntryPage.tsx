// Entering the private context on the shared device (ADR-0009 private_session): person + PIN with the same control as
// every Confirmação necessária (PinConfirm). The server verifies and owns lockout; the session model is unchanged.
// On the mobile shell: the private bar (the door to the area, not yet inside it), back in history, Entrar in the bottom
// bar; after a successful entry this screen is replaced by the destination, so back never returns to the PIN.
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enterPrivateContext, getPrivateStatus, listPrivatePeople, privateKeys, privatePurpose } from '../../modules/org/privateContext'
import { PinConfirm } from '../../modules/org/PinConfirm'
import { isPinError, VERIFY_MESSAGES } from '../../modules/org/verifyMessages'
import { toAppError } from '../../shared/errors'
import { AppBar, AppScreen, BottomActionBar } from '../../shared/ui/AppShell'
import { Icon } from '../../shared/ui/Icon'
import { useAppBack } from '../../shared/ui/navigation'

const EMPTY = {
  private: 'Ninguém com acesso à área privada neste dispositivo.',
  fecho: 'Ninguém com acesso ao Fecho neste dispositivo.',
  negocio: 'Ninguém com acesso ao Negócio neste dispositivo.',
} as const

export function PrivateEntryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const back = useAppBack('/')
  const qc = useQueryClient()
  const { ended, next } = (location.state as { ended?: boolean; next?: string } | null) ?? {}
  const purpose = privatePurpose(next)
  const people = useQuery({ queryKey: privateKeys.people(purpose), queryFn: () => listPrivatePeople(purpose) })
  const [personId, setPersonId] = useState<string | null>(null)
  const [secret, setSecret] = useState('')
  const enter = useMutation({
    mutationFn: () => enterPrivateContext(personId!, secret),
    onSuccess: async () => {
      setSecret('')
      // fetch, not just invalidate: the status query has no observer here, and a stale "inactive" would bounce the gate
      await qc.fetchQuery({ queryKey: privateKeys.status, queryFn: getPrivateStatus, staleTime: 0 })
      navigate(next && next.startsWith('/privado/') ? next : '/privado', { replace: true }) },
    onError: () => setSecret(''),
  })
  const err = useMemo(() => (enter.error ? toAppError(enter.error) : null), [enter.error])

  return (
    <AppScreen
      bar={<AppBar tone="private" overline={<><Icon name="lock" size={14} strokeWidth={2.5} /><span>Área privada</span></>} title="Entrar" leading="back" onLeading={back} />}
      actions={
        <BottomActionBar>
          <button className="btn btn-primary btn-tall" disabled={!personId || !secret || enter.isPending} onClick={() => enter.mutate()}>
            {enter.isPending ? 'A verificar…' : 'Entrar'}
          </button>
        </BottomActionBar>
      }>
      <section className="stack stack-loose">
        <h2>Quem é?</h2>
        <p className="note">Os valores pessoais só aparecem depois de confirmar quem é. A área fecha ao sair e ao fim de pouco tempo.</p>
        {ended && <div className="notice notice-warning" role="status">A área privada terminou. Confirme de novo para continuar.</div>}
        <PinConfirm legend="Pessoa" people={people.data} loading={people.isPending} emptyText={EMPTY[purpose]}
          personId={personId} onPerson={setPersonId} secret={secret} onSecret={setSecret} error={err} />
        {err && !isPinError(err) && <div className="notice notice-error" role="alert">{(err.code && VERIFY_MESSAGES[err.code]) || 'Não foi possível entrar.'}</div>}
      </section>
    </AppScreen>
  )
}
