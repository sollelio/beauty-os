// Reabrir período (Slice 06 E4; decided 2026-10-07): authorization (B8) and a mandatory reason. The period returns
// to Em pagamento when it has confirmed payments, otherwise to Pronto para pagamento. Everything approved, paid and
// decided stays recorded; the reopen is its own entry in the history. On the mobile shell: a typed reason is not
// dropped by back unasked; the final action is destructive (it undoes a close) and only appears once there is a reason;
// after it, back to where the reopen was opened, with no reopen screen left behind.
import { useState } from 'react'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { reopenPeriod, type Fecho } from '../../modules/period/api'
import { formatDayShort, formatTime } from '../../shared/time'
import { AppScreen } from '../../shared/ui/AppShell'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { Field } from '../../shared/ui/Field'
import { useAppBack, useFlow } from '../../shared/ui/navigation'
import { PrivateBar } from '../privado/PrivateBar'
import { useFecho } from './fecho'
import { BoundaryScreen, KV, Loading } from './ui'

export function ReopenPage() {
  const { q, to } = useFecho()
  const back = useAppBack(to('/privado/fecho'))
  if (!q.data) return <Loading q={q} title="Reabrir período" />
  const f = q.data
  if (f.period.state !== 'fechado' || !f.closed) {
    return (
      <AppScreen bar={<PrivateBar title="Reabrir período" onBack={back} exit={false} />}>
        <div className="notice notice-warning" role="status">Este período não está fechado.</div>
        <button className="btn btn-secondary" onClick={back}>Voltar ao Fecho</button>
      </AppScreen>
    )
  }
  return <ReopenForm f={{ ...f, closed: f.closed }} parent={to('/privado/fecho')} />
}

function ReopenForm({ f, parent }: { f: Fecho & { closed: NonNullable<Fecho['closed']> }; parent: string }) {
  const org = useOrganization()
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  const flow = useFlow({ steps: 1, parent, dirty: trimmed !== '', reachable: () => true })
  return (
    <>
      <BoundaryScreen bar={<PrivateBar title="Reabrir período" onBack={flow.exit} exit={false} />}
        top={
          <section className="stack">
            <Field label="Motivo (obrigatório)" hint={trimmed ? undefined : 'Escreva o motivo para continuar.'}>
              <input maxLength={120} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </section>
        }
        blocked={!trimmed} permission="period.reopen" run={reopenPeriod} input={{ periodId: f.period.id, revision: f.review_revision, reason: trimmed }}
        intro="Um período fechado só reabre com autorização e motivo. Tudo o que foi aprovado, pago e decidido continua registado."
        lockNote="Fica no histórico quem reabriu, quando e porquê. Reabrir permite rever a decisão dos sócios e confirmar pagamentos em falta; depois, o período volta a ser fechado."
        label="Reabrir período" onSuccess={() => flow.finishTo(parent)} onBack={flow.exit} destructive>
        <KV rows={[['Período', f.period.label], ['Fechado', `${formatDayShort(f.closed.closed_at, org.timezone)} às ${formatTime(f.closed.closed_at, org.timezone)} por ${f.closed.closed_by}`]]} />
      </BoundaryScreen>
      <DiscardSheet open={flow.discard.open} title="Sair sem reabrir?" detail="O motivo escrito perde-se. O período continua fechado." onDiscard={flow.discard.confirm} onKeep={flow.discard.cancel} />
    </>
  )
}
