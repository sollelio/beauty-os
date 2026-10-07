// Reabrir período (Slice 06 E4; decided 2026-10-07): authorization (B8) and a mandatory reason. The period returns
// to Em pagamento when it has confirmed payments, otherwise to Pronto para pagamento. Everything approved, paid and
// decided stays recorded; the reopen is its own entry in the history.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { reopenPeriod } from '../../modules/period/api'
import { formatDayShort, formatTime } from '../../shared/time'
import { useFecho } from './fecho'
import { Boundary, FechoHeader, KV, Loading } from './ui'

export function ReopenPage() {
  const org = useOrganization()
  const navigate = useNavigate()
  const { q, to } = useFecho()
  const [reason, setReason] = useState('')
  if (!q.data) return <Loading q={q} />
  const f = q.data
  const back = () => navigate(to('/privado/fecho'))
  if (f.period.state !== 'fechado' || !f.closed) {
    return <main className="app-main"><FechoHeader title="Reabrir período" back={back} />
      <div className="notice notice-warning">Este período não está fechado.</div>
      <button className="btn btn-secondary" onClick={back}>Voltar ao Fecho</button></main>
  }
  const trimmed = reason.trim()
  return (
    <main className="app-main">
      <FechoHeader title="Reabrir período" back={back} />
      <section className="stack" style={{ gap: '0.375rem' }}>
        <label className="label" htmlFor="reopen-reason">Motivo (obrigatório)</label>
        <label className="field"><input id="reopen-reason" maxLength={120} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      </section>
      {trimmed ? (
        <Boundary permission="period.reopen" run={reopenPeriod} input={{ periodId: f.period.id, revision: f.review_revision, reason: trimmed }}
          intro="Um período fechado só reabre com autorização e motivo. Tudo o que foi aprovado, pago e decidido continua registado."
          lockNote="Fica no histórico quem reabriu, quando e porquê. Reabrir permite rever a decisão dos sócios e confirmar pagamentos em falta; depois, o período volta a ser fechado."
          label="Reabrir período" onSuccess={back} onBack={back}>
          <KV rows={[['Período', f.period.label], ['Fechado', `${formatDayShort(f.closed.closed_at, org.timezone)} às ${formatTime(f.closed.closed_at, org.timezone)} por ${f.closed.closed_by}`]]} />
        </Boundary>
      ) : (
        <p className="muted" style={{ margin: 0 }}>Escreva o motivo para continuar.</p>
      )}
    </main>
  )
}
