// Fecho building blocks (Slice 06 §16): detail header with the Privado badge, state strip, pills, exception rows and
// the Confirmação necessária boundary used by every Fecho decision (one-shot verification, ADR-0009).
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ConfirmerPicker } from '../../modules/org/ConfirmerPicker'
import { useVerifiedCommand } from '../../modules/org/useVerifiedCommand'
import type { ConfirmPermission } from '../../modules/org/api'
import { fechoKeys, STATE_LABEL, STATE_ORDER, type PeriodState } from '../../modules/period/api'
import { toAppError } from '../../shared/errors'
import { FECHO_MESSAGES } from './fecho'

export function FechoHeader({ title, back, right }: { title: string; back: () => void; right?: ReactNode }) {
  return (
    <div className="flow-header-row">
      <button className="icon-btn" aria-label="Voltar" onClick={back}>←</button>
      <span className="muted" style={{ fontWeight: 600 }}>{title}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>{right}<span className="priv">Privado</span></span>
    </div>
  )
}

export function StateStrip({ state }: { state: PeriodState }) {
  const i = STATE_ORDER.indexOf(state)
  return (
    <div className="stack" style={{ gap: '0.375rem' }}>
      <div className="progress" aria-hidden>{STATE_ORDER.map((s, n) => <span key={s} className={n <= i ? 'on' : ''} />)}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }} data-testid="state-strip">
        <strong style={{ fontSize: '0.875rem' }}>{STATE_LABEL[state]}</strong>
        {i < 3 && <span className="muted" style={{ fontSize: '0.875rem' }}>depois: {STATE_LABEL[STATE_ORDER[i + 1]!]}</span>}
      </div>
    </div>
  )
}

export type PillKind = 'block' | 'review' | 'ok' | 'neutral'
export const Pill = ({ kind, children }: { kind: PillKind; children: ReactNode }) => <span className={`pill pill-${kind}`}>{children}</span>

export function ExceptionRow({ dot, title, sub, pill, pillKind, onOpen }: { dot: 'amber' | 'neutral'; title: string; sub: string; pill: string; pillKind: PillKind; onOpen?: () => void }) {
  const body = (
    <>
      <span aria-hidden className={`xdot xdot-${dot}`} />
      <span className="grow"><strong style={{ display: 'block' }}>{title}</strong><span className="muted num" style={{ fontSize: '0.8125rem' }}>{sub}</span></span>
      <Pill kind={pillKind}>{pill}</Pill>
    </>
  )
  return onOpen ? <button className="xrow" onClick={onOpen}>{body}</button> : <div className="xrow">{body}</div>
}

export function SummaryRow({ title, sub, onOpen }: { title: string; sub: string; onOpen: () => void }) {
  return (
    <button className="brow" onClick={onOpen}>
      <span className="grow"><strong style={{ display: 'block' }}>{title}</strong><span className="muted num" style={{ fontSize: '0.8125rem' }}>{sub}</span></span>
      <span aria-hidden className="muted">›</span>
    </button>
  )
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="kv-card">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>
}

/** Confirmação necessária (Slice 02 boundary): verify the confirming person, run the command once per intent. */
export function Boundary<I, R>({ intro, children, lockNote, permission, run, input, label, onSuccess, blocked, onBack }: {
  intro: string; children?: ReactNode; lockNote: string; permission: ConfirmPermission
  run: (commandId: string, grantId: string, input: I) => Promise<R>; input: I; label: string
  onSuccess: (r: R) => void; blocked?: boolean; onBack?: () => void
}) {
  const qc = useQueryClient()
  const command = useVerifiedCommand<I, R>(run)
  const [confirmerId, setConfirmerId] = useState<string | null>(null)
  const [secret, setSecret] = useState('')
  const err = command.status === 'error' ? command.error : null
  const stale = err?.code === 'STALE_REVIEW' || err?.code === 'PERIOD_STATE_INVALID'
  useEffect(() => { if (stale) void qc.invalidateQueries({ queryKey: fechoKeys.all }) }, [stale, qc])

  function confirm() {
    if (!confirmerId || !secret) return
    command.confirm({ input, confirmerId, secret }, {
      onSuccess: (r) => { setSecret(''); void qc.invalidateQueries({ queryKey: fechoKeys.all }); onSuccess(r) },
    })
  }
  return (
    <>
      <section className="stack" style={{ gap: '1rem' }}>
        <h2>Confirmação necessária</h2>
        <p className="muted" style={{ margin: 0 }}>{intro}</p>
        {children}
        <div className="lock-note"><span aria-hidden>🔒</span><span>{lockNote}</span></div>
        {!blocked && <ConfirmerPicker permission={permission} confirmerId={confirmerId} onConfirmer={setConfirmerId} secret={secret} onSecret={setSecret} />}
        {err?.kind === 'network' && (
          <div className="notice notice-error" role="alert"><strong style={{ display: 'block' }}>Não foi registado.</strong>Não foi possível ligar ao servidor. Nada mudou; tente novamente.</div>
        )}
        {err && err.kind !== 'network' && (
          <div className={`notice ${stale ? 'notice-warning' : 'notice-error'}`} role="alert">{(err.code && FECHO_MESSAGES[err.code]) || 'Não foi possível registar.'}</div>
        )}
      </section>
      {!blocked && (
        <div className="footer">
          {err?.kind === 'network' ? (
            <>
              <button className="btn btn-primary btn-tall" onClick={confirm}>Tentar novamente</button>
              {onBack && <button className="btn btn-secondary" onClick={onBack}>Voltar sem registar</button>}
            </>
          ) : (
            <button className="btn btn-primary btn-tall" disabled={!confirmerId || !secret || command.status === 'pending'} onClick={confirm}>
              {command.status === 'pending' ? 'A confirmar…' : label}
            </button>
          )}
        </div>
      )}
    </>
  )
}

export function Loading({ q }: { q: { isError: boolean; error: unknown } }) {
  const navigate = useNavigate()
  if (q.isError) {
    const code = toAppError(q.error).code
    return (
      <main className="app-main">
        <div className="notice notice-error" role="alert">
          {code === 'NOT_AUTHORIZED' ? 'O Fecho só está disponível para quem gere as finanças da equipa.' : 'Não foi possível carregar o Fecho.'}
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/privado')}>Voltar</button>
      </main>
    )
  }
  return <main className="app-main"><p className="muted">A carregar…</p></main>
}

