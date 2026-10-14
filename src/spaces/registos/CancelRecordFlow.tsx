// Anular registo (pilot corrections, 2026-10-07): what is being cancelled · mandatory reason · Confirmação necessária
// by a person who may correct records · success, with the way to record the right value through the normal flow.
// Shared patterns: app bar with the back contract (a typed reason is never dropped silently), the person/PIN control,
// and a destructive final action. The correction itself (cancelRecord, nothing deleted) is unchanged.
// `area="private"` (UX slice 7): opened from the private area (/privado/anular/…, inside the gate) it wears the private
// bar and returns there — back, cancel and "Voltar" after success never leave the private area; only "Registar de
// novo" does, because the normal capture flows are public (leaving ends the private context, 07 §8).
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { ConfirmerPicker } from '../../modules/org/ConfirmerPicker'
import { isPinError, VERIFY_MESSAGES } from '../../modules/org/verifyMessages'
import { useVerifiedCommand } from '../../modules/org/useVerifiedCommand'
import { cancelRecord, correctionKeys, getRecordSummary, KIND_LABEL, RECAPTURE_PATH, type CancelInput, type RecordKind } from '../../modules/corrections/api'
import { formatMoney } from '../../shared/money'
import { formatDayShort, formatTime } from '../../shared/time'
import { AppBar, AppScreen, BottomActionBar, LockIcon } from '../../shared/ui/AppShell'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { Field } from '../../shared/ui/Field'
import { Icon } from '../../shared/ui/Icon'
import { useFlow } from '../../shared/ui/navigation'
import { ErrorState, Skeleton } from '../../shared/ui/states'
import { PrivateBar } from '../privado/PrivateBar'

const MESSAGES: Record<string, string> = {
  ...VERIFY_MESSAGES,
  NOT_AUTHORIZED: 'Esta pessoa não pode anular registos.',
  PERIOD_APPROVED: 'O período deste registo já tem os valores aprovados: não é possível anular. Se ainda não houver pagamentos, a gestão pode anular a aprovação no Fecho.',
  PERIOD_CLOSED: 'O período deste registo está fechado: não é possível anular.',
  RECORD_ALREADY_CANCELLED: 'Este registo já foi anulado.',
  RECORD_IN_USE: 'Esta despesa ou compra já foi marcada como paga pela reserva: não pode ser anulada.',
  VALIDATION_FAILED: 'Escreva o motivo da anulação.',
}

export function CancelRecordFlow({ area }: { area?: 'private' } = {}) {
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
  const inPrivate = area === 'private'
  const flow = useFlow({ steps: 1, parent: inPrivate ? '/privado' : '/', dirty: reason.trim() !== '' && !done, reachable: () => true })
  const bar = inPrivate
    ? <PrivateBar title="Anular registo" onBack={flow.exit} exit={false} />
    : <AppBar title="Anular registo" leading="back" onLeading={flow.exit} />

  if (!summary.data) {
    return (
      <AppScreen bar={bar}>
        {summary.isError
          ? <ErrorState onRetry={() => summary.refetch()} action={<button type="button" className="link-btn" onClick={flow.exit}>Voltar</button>}>Não foi possível encontrar este registo.</ErrorState>
          : <Skeleton rows={3} />}
      </AppScreen>
    )
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
    const recapture = <button className={`btn ${inPrivate ? 'btn-secondary' : 'btn-primary btn-tall'}`} onClick={() => navigate(RECAPTURE_PATH[s.kind])}>Registar de novo, com o valor certo</button>
    return (
      <AppScreen bar={bar}
        actions={
          <BottomActionBar>
            {inPrivate ? (
              <>
                <button className="btn btn-primary btn-tall" onClick={flow.exit}>Voltar</button>
                {recapture}
                <span className="bar-summary support">Registar de novo abre o registo normal e sai da área privada.</span>
              </>
            ) : (
              <>
                {recapture}
                <button className="btn btn-secondary" onClick={() => flow.leaveTo('/')}>Voltar a Hoje</button>
              </>
            )}
          </BottomActionBar>
        }>
        <div className="stack center success">
          <span aria-hidden className="success-mark"><Icon name="check" size={32} strokeWidth={2.5} /></span>
          <h2>{done ? 'Registo anulado.' : 'Este registo já foi anulado.'}</h2>
          <p className="note">Nada foi apagado: o original fica no histórico, marcado como anulado, e deixa de contar nos valores.</p>
          {s.cancelled && <p className="note num">Anulado por {s.cancelled.by} · {formatDayShort(s.cancelled.at, org.timezone)} às {formatTime(s.cancelled.at, org.timezone)} · motivo: {s.cancelled.reason}</p>}
        </div>
        {what}
      </AppScreen>
    )
  }

  function confirm() {
    if (!confirmerId || !secret || !reason.trim()) return
    command.confirm({ input: { kind: s.kind, recordId, reason: reason.trim() }, confirmerId, secret }, {
      onSuccess: async () => { setSecret(''); flow.finish(); await qc.invalidateQueries(); setDone(true) },
    })
  }
  const ready = reason.trim() !== '' && confirmerId !== null && secret !== ''
  return (
    <AppScreen
      bar={bar}
      actions={
        <BottomActionBar>
          {!reason.trim() && <span className="bar-summary">Escreva o motivo para continuar.</span>}
          <button className="btn btn-danger btn-tall" disabled={!ready || command.status === 'pending'} onClick={confirm}>
            {command.status === 'pending' ? 'A anular…' : err?.kind === 'network' ? 'Tentar novamente' : 'Anular registo'}
          </button>
        </BottomActionBar>
      }>
      <section className="stack" style={{ gap: '1rem' }}>
        <h2>Anular este registo?</h2>
        {what}
        <p className="muted" style={{ margin: 0 }}>Nada é apagado. O registo fica no histórico, marcado como anulado, e deixa de contar nos valores. Depois pode registá-lo de novo com o valor certo.</p>
        <Field id="cancel-reason" label="Motivo (obrigatório)">
          <input maxLength={120} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Confirmação necessária</h3>
        <div className="lock-note"><LockIcon /><span>Fica no histórico com quem anulou, quando e porquê.</span></div>
        <ConfirmerPicker permission="records.correct" confirmerId={confirmerId} onConfirmer={setConfirmerId} secret={secret} onSecret={setSecret}
          error={err} messages={MESSAGES} />
        {err?.kind === 'network' && <div className="notice notice-error" role="alert">Não foi possível anular. Nada mudou; tente novamente.</div>}
        {err && err.kind !== 'network' && !isPinError(err) && <div className="notice notice-error" role="alert">{(err.code && MESSAGES[err.code]) || 'Não foi possível anular este registo.'}</div>}
      </section>
      <DiscardSheet open={flow.discard.open} title="Sair sem anular?" detail="O motivo escrito perde-se. Nada foi anulado." onDiscard={flow.discard.confirm} onKeep={flow.discard.cancel} />
    </AppScreen>
  )
}
