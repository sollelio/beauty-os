// Fecho hooks (UX slice 7): the Confirmação necessária boundary (one-shot verification, ADR-0009) as a form and its
// actions — a screen puts the actions in the bottom bar, a sheet keeps them inside — and a sheet guarded while it holds
// a typed draft. The commands, grants, idempotency (useVerifiedCommand) and messages are those of Slice 06.
import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ConfirmerPicker } from '../../modules/org/ConfirmerPicker'
import { isPinError } from '../../modules/org/verifyMessages'
import { useVerifiedCommand } from '../../modules/org/useVerifiedCommand'
import type { ConfirmPermission } from '../../modules/org/api'
import { fechoKeys } from '../../modules/period/api'
import { LockIcon } from '../../shared/ui/AppShell'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { useFlow, useSheet } from '../../shared/ui/navigation'
import { FECHO_MESSAGES } from './fecho'

export type BoundaryProps<I, R> = {
  intro: string; children?: ReactNode; lockNote: string; permission: ConfirmPermission
  run: (commandId: string, grantId: string, input: I) => Promise<R>; input: I; label: string
  onSuccess: (r: R) => void; blocked?: boolean; onBack?: () => void
  /** The command undoes or invalidates something (reabrir, anular aprovação): its final button says so. */
  destructive?: boolean
}

/** Confirmação necessária (Slice 02 boundary): verify the confirming person, run the command once per intent. */
export function useBoundary<I, R>({ intro, children, lockNote, permission, run, input, label, onSuccess, blocked, onBack, destructive }: BoundaryProps<I, R>) {
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
  const form = (
    <section className="stack stack-loose">
      <h2>Confirmação necessária</h2>
      <p className="note">{intro}</p>
      {children}
      <div className="lock-note"><LockIcon /><span>{lockNote}</span></div>
      {!blocked && <ConfirmerPicker permission={permission} confirmerId={confirmerId} onConfirmer={setConfirmerId} secret={secret} onSecret={setSecret}
        error={err} messages={FECHO_MESSAGES} />}
      {err?.kind === 'network' && (
        <div className="notice notice-error" role="alert"><strong style={{ display: 'block' }}>Não foi registado.</strong>Não foi possível ligar ao servidor. Nada mudou; tente novamente.</div>
      )}
      {err && err.kind !== 'network' && !isPinError(err) && (
        <div className={`notice ${stale ? 'notice-warning' : 'notice-error'}`} role="alert">{(err.code && FECHO_MESSAGES[err.code]) || 'Não foi possível registar.'}</div>
      )}
    </section>
  )
  const actions = blocked ? null : err?.kind === 'network' ? (
    <>
      <button className="btn btn-primary btn-tall" onClick={confirm}>Tentar novamente</button>
      {onBack && <button className="btn btn-secondary" onClick={onBack}>Voltar sem registar</button>}
    </>
  ) : (
    <button className={`btn ${destructive ? 'btn-danger' : 'btn-primary'} btn-tall`} disabled={!confirmerId || !secret || command.status === 'pending'} onClick={confirm}>
      {command.status === 'pending' ? 'A confirmar…' : label}
    </button>
  )
  return { form, actions }
}

/** A sheet that may hold a typed draft (an amount, a choice) before its Confirmação: one history entry (back closes it),
 *  but while it holds a draft, back, × and the backdrop ask "Descartar?" first — the capture flows' sheet guard. */
export function useDraftSheet<T>(parent: string, title: string) {
  const sheets = useSheet<T>()
  const [dirty, setDirty] = useState(false)
  const [asking, setAsking] = useState(false)
  const held = dirty && sheets.current !== null
  const flow = useFlow({ steps: 1, parent, dirty: false, sheetDirty: held, reachable: () => true })
  const reset = () => { setDirty(false); setAsking(false) }
  return {
    current: sheets.current,
    open: (c: T) => { reset(); sheets.open(c) },
    setDirty,
    dirty: held,
    /** ×, backdrop: asks when there is a draft. */
    close: () => (held ? setAsking(true) : sheets.close()),
    /** After the command succeeded: closes without asking. */
    done: () => { flow.allowNext(); reset(); sheets.close() },
    discard: (
      <DiscardSheet open={asking || (flow.discard.open && flow.discard.reason === 'sheet')} title={title}
        onKeep={() => (asking ? setAsking(false) : flow.discard.cancel())}
        onDiscard={() => { if (asking) { flow.allowNext(); reset(); sheets.close() } else { reset(); flow.discard.confirm() } }} />
    ),
  }
}
