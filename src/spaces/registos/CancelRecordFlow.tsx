// Anular registo (pilot corrections, 2026-10-07): what is being cancelled · mandatory reason · Confirmação necessária
// by a person who may correct records · success, with the way to record the right value through the normal flow.
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { ConfirmerPicker } from '../../modules/org/ConfirmerPicker'
import { VERIFY_MESSAGES } from '../../modules/org/verifyMessages'
import { useVerifiedCommand } from '../../modules/org/useVerifiedCommand'
import { cancelRecord, correctionKeys, getRecordSummary, KIND_LABEL, RECAPTURE_PATH, type CancelInput, type RecordKind } from '../../modules/corrections/api'
import { formatMoney } from '../../shared/money'
import { formatDayShort, formatTime } from '../../shared/time'

const MESSAGES: Record<string, string> = {
  ...VERIFY_MESSAGES,
  NOT_AUTHORIZED: 'Esta pessoa não pode anular registos.',
  PERIOD_APPROVED: 'O período deste registo já tem os valores aprovados: não é possível anular. Se ainda não houver pagamentos, a gestão pode anular a aprovação no Fecho.',
  PERIOD_CLOSED: 'O período deste registo está fechado: não é possível anular.',
  RECORD_ALREADY_CANCELLED: 'Este registo já foi anulado.',
  RECORD_IN_USE: 'Esta despesa ou compra já foi marcada como paga pela reserva: não pode ser anulada.',
  VALIDATION_FAILED: 'Escreva o motivo da anulação.',
}

export function CancelRecordFlow() {
  const org = useOrganization()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { kind = 'service', recordId = '' } = useParams() as { kind: RecordKind; recordId: string }
  const summary = useQuery({ queryKey: correctionKeys.summary(kind, recordId), queryFn: () => getRecordSummary(kind, recordId) })
  const command = useVerifiedCommand<CancelInput, Awaited<ReturnType<typeof cancelRecord>>>(cancelRecord)
  const [reason, setReason] = useState('')
  const [confirmerId, setConfirmerId] = useState<string | null>(null)
  const [secret, setSecret] = useState('')
  const [done, setDone] = useState(false)
  const m = (n: number) => formatMoney(n, org)
  const err = command.status === 'error' ? command.error : null

  if (!summary.data) {
    return <main className="app-main">{summary.isError
      ? <><div className="notice notice-error" role="alert">Não foi possível encontrar este registo.</div><button className="btn btn-secondary" onClick={() => navigate('/')}>Voltar a Hoje</button></>
      : <p className="muted">A carregar…</p>}</main>
  }
  const s = summary.data
  const what = (
    <dl className="kv-card" data-testid="cancel-what">
      <div><dt>Registo</dt><dd>{KIND_LABEL[s.kind]} · {s.title}</dd></div>
      {s.person && <div><dt>Pessoa</dt><dd>{s.person}</dd></div>}
      <div><dt>Valor</dt><dd className="num">{m(s.amount_minor)}</dd></div>
      <div><dt>Registado</dt><dd className="num">{formatDayShort(s.occurred_at, org.timezone)} às {formatTime(s.occurred_at, org.timezone)}</dd></div>
    </dl>
  )

  if (done || s.cancelled) {
    return (
      <main className="app-main">
        <div className="stack center" style={{ marginTop: '2rem', gap: '0.75rem' }}>
          <span aria-hidden className="success-mark">✓</span>
          <h2>{done ? 'Registo anulado.' : 'Este registo já foi anulado.'}</h2>
          <p className="muted" style={{ margin: 0 }}>Nada foi apagado: o original fica no histórico, marcado como anulado, e deixa de contar nos valores.</p>
          {s.cancelled && <p className="muted num" style={{ margin: 0 }}>Anulado por {s.cancelled.by} · {formatDayShort(s.cancelled.at, org.timezone)} às {formatTime(s.cancelled.at, org.timezone)} · motivo: {s.cancelled.reason}</p>}
        </div>
        {what}
        <div className="footer">
          <button className="btn btn-primary btn-tall" onClick={() => navigate(RECAPTURE_PATH[s.kind])}>Registar de novo, com o valor certo</button>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>Voltar a Hoje</button>
        </div>
      </main>
    )
  }

  function confirm() {
    if (!confirmerId || !secret || !reason.trim()) return
    command.confirm({ input: { kind: s.kind, recordId, reason: reason.trim() }, confirmerId, secret }, {
      onSuccess: async () => { setSecret(''); await qc.invalidateQueries(); setDone(true) },
    })
  }
  return (
    <main className="app-main">
      <header className="flow-header-row">
        <button className="icon-btn" aria-label="Voltar" onClick={() => navigate(-1)}>←</button>
        <span className="muted" style={{ fontWeight: 600 }}>Anular registo</span><span style={{ width: '2.75rem' }} />
      </header>
      <section className="stack" style={{ gap: '1rem' }}>
        <h2>Anular este registo?</h2>
        {what}
        <p className="muted" style={{ margin: 0 }}>Nada é apagado. O registo fica no histórico, marcado como anulado, e deixa de contar nos valores. Depois pode registá-lo de novo com o valor certo.</p>
        <div className="stack" style={{ gap: '0.375rem' }}>
          <label className="label" htmlFor="cancel-reason">Motivo (obrigatório)</label>
          <label className="field"><input id="cancel-reason" maxLength={120} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        </div>
        {reason.trim() ? (
          <>
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Confirmação necessária</h3>
            <ConfirmerPicker permission="records.correct" confirmerId={confirmerId} onConfirmer={setConfirmerId} secret={secret} onSecret={setSecret} />
            <div className="lock-note"><span aria-hidden>🔒</span><span>Fica no histórico com quem anulou, quando e porquê.</span></div>
          </>
        ) : <p className="muted" style={{ margin: 0 }}>Escreva o motivo para continuar.</p>}
        {err?.kind === 'network' && <div className="notice notice-error" role="alert">Não foi possível anular. Nada mudou; tente novamente.</div>}
        {err && err.kind !== 'network' && <div className="notice notice-error" role="alert">{(err.code && MESSAGES[err.code]) || 'Não foi possível anular este registo.'}</div>}
      </section>
      <div className="footer">
        <button className="btn btn-primary btn-tall" disabled={!reason.trim() || !confirmerId || !secret || command.status === 'pending'} onClick={confirm}>
          {command.status === 'pending' ? 'A anular…' : err?.kind === 'network' ? 'Tentar novamente' : 'Anular registo'}
        </button>
      </div>
    </main>
  )
}
