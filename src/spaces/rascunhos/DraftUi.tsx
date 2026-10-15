// Pieces the three movement flows share for drafts (Offline 6): loading / missing states, the honest "saved on this
// phone" screen, and the review mark of a draft the server did not accept.
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { reenterDraft, type MovementDraft } from '../../modules/movements/drafts'
import { offlineKeys, useOfflineRuntime } from '../../shared/offline/runtime'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { AppBar, AppScreen, BottomActionBar } from '../../shared/ui/AppShell'
import { Icon } from '../../shared/ui/Icon'
import { useAppBack } from '../../shared/ui/navigation'
import { Skeleton } from '../../shared/ui/states'
import { DRAFT_SAVED_SUPPORT, DRAFT_SAVED_TITLE, LOCKED_TEXT, reviewText } from './copy'

export function DraftLoading({ title }: { title: string }) {
  const back = useAppBack('/rascunhos')
  return <AppScreen bar={<AppBar title={title} leading="back" onLeading={back} />}><Skeleton rows={3} /></AppScreen>
}

export function DraftMissing({ title }: { title: string }) {
  const back = useAppBack('/rascunhos')
  return (
    <AppScreen bar={<AppBar title={title} leading="back" onLeading={back} />}>
      <div className="notice notice-neutral" role="status">Este rascunho já não está neste telemóvel.</div>
    </AppScreen>
  )
}

export function DraftSaved({ summary, when, onAnother, anotherLabel, onHoje }: {
  summary: ReactNode; when: string; onAnother: () => void; anotherLabel: string; onHoje: () => void
}) {
  return (
    <AppScreen actions={
      <BottomActionBar>
        <button className="btn btn-primary btn-tall" onClick={onHoje}>Voltar a Hoje</button>
        <button className="btn btn-secondary" onClick={onAnother}>{anotherLabel}</button>
      </BottomActionBar>
    }>
      <div className="stack center success" data-testid="draft-saved">
        <span aria-hidden className="success-mark success-mark-local"><Icon name="clock" size={34} strokeWidth={2.5} /></span>
        <h2>{DRAFT_SAVED_TITLE}</h2>
        <p className="support">{DRAFT_SAVED_SUPPORT}</p>
        <p className="note num">{summary}</p>
        <p className="note num">Guardado {when}</p>
      </div>
    </AppScreen>
  )
}

/** The draft's state before confirming it: why it needs review, or that its content is locked. */
export function DraftNotes({ draft }: { draft: MovementDraft | null }) {
  if (!draft) return null
  return (
    <>
      {draft.payload.review && (
        <div className="notice notice-warning" role="status" data-testid="draft-review"><strong>Precisa de revisão.</strong> {reviewText(draft.payload.review.code)}</div>
      )}
      {draft.payload.attempt?.sent && <div className="notice notice-neutral" role="status">{LOCKED_TEXT}</div>}
    </>
  )
}

/** The offline last step: a summary and what will happen — no PIN, nothing sent. */
export function DraftSaveStep({ what, children }: { what: string; children: ReactNode }) {
  return (
    <section className="stack stack-loose" data-testid="draft-save-step">
      <h2>Guardar neste telemóvel</h2>
      <p className="note">Sem ligação: {what} fica guardado neste telemóvel e só é registado depois de confirmado com PIN, quando houver ligação.</p>
      {children}
    </section>
  )
}

/**
 * A draft the server refused in a way confirming again cannot fix (period approved or closed, captured time out of
 * the window, not authorized, possibly received already): no PIN here. It can be discarded, or — except when it may
 * have been received — entered again as a clearly new movement with the time of now (Offline 7).
 */
export function DraftBlocked({ draft, onDiscard }: { draft: MovementDraft; onDiscard: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { storeAccess, refresh } = useOfflineRuntime()
  const [ask, setAsk] = useState(false)
  const [failed, setFailed] = useState(false)
  const uncertain = draft.payload.review?.code === 'IDEMPOTENCY_CONFLICT'
  async function reenter() {
    setAsk(false)
    try {
      await reenterDraft(await storeAccess!.getStore(), draft)
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: offlineKeys.all })])
      navigate('/rascunhos', { replace: true })
    } catch { setFailed(true) }
  }
  return (
    <div className="stack" data-testid="draft-blocked">
      <p className="note">Este rascunho não pode ser confirmado como está.{uncertain ? ' Confirme no histórico se já foi registado antes de o descartar.' : ''}</p>
      <div className="wrap">
        {!uncertain && <button className="btn btn-secondary btn-fit" onClick={() => setAsk(true)}>Registar como novo</button>}
        <button className="link-btn" onClick={onDiscard}>Descartar rascunho</button>
      </div>
      {failed && <div className="notice notice-error" role="alert">Não foi possível criar o novo rascunho neste telemóvel.</div>}
      {ask && (
        <ConfirmDialog title="Registar como novo?" safeLabel="Cancelar" destructiveLabel="Criar novo rascunho" onSafe={() => setAsk(false)} onDestructive={() => void reenter()}>
          Fica um rascunho novo, com a hora de agora — conta no período atual, não no original. Este rascunho é descartado.
        </ConfirmDialog>
      )}
    </div>
  )
}

