// Entering the private context on the shared device (ADR-0009 private_session): person + PIN with the same control as
// every Confirmação necessária (PinConfirm). The server verifies and owns lockout; the session model is unchanged.
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { enterPrivateContext, getPrivateStatus, listPrivatePeople, privateKeys } from '../../modules/org/privateContext'
import { PinConfirm } from '../../modules/org/PinConfirm'
import { isPinError, VERIFY_MESSAGES } from '../../modules/org/verifyMessages'
import { toAppError } from '../../shared/errors'

export function PrivateEntryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const people = useQuery({ queryKey: privateKeys.people, queryFn: listPrivatePeople })
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
  const { ended, next } = (location.state as { ended?: boolean; next?: string } | null) ?? {}

  return (
    <main className="app-main">
      <header className="flow-header-row">
        <button className="icon-btn" aria-label="Voltar" onClick={() => navigate('/')}>←</button>
        <span className="muted" style={{ fontWeight: 600 }}>Área privada</span>
        <span className="priv">Privado</span>
      </header>
      <section className="stack" style={{ gap: '1rem' }}>
        <h2>Quem é?</h2>
        <p className="muted" style={{ margin: 0 }}>Os valores pessoais só aparecem depois de confirmar quem é. A área fecha ao sair e ao fim de pouco tempo.</p>
        {ended && <div className="notice notice-warning" role="status">A área privada terminou.</div>}
        <PinConfirm legend="Pessoa" people={people.data} loading={people.isPending} emptyText="Ninguém com acesso à área privada neste dispositivo."
          personId={personId} onPerson={setPersonId} secret={secret} onSecret={setSecret} error={err} />
        {err && !isPinError(err) && <div className="notice notice-error" role="alert">{(err.code && VERIFY_MESSAGES[err.code]) || 'Não foi possível entrar.'}</div>}
      </section>
      <div className="footer">
        <button className="btn btn-primary btn-tall" disabled={!personId || !secret || enter.isPending} onClick={() => enter.mutate()}>
          {enter.isPending ? 'A verificar…' : 'Entrar'}
        </button>
      </div>
    </main>
  )
}
