// Adiantamento (Slice 02 §4): para quem? → Quanto e como? → Confirmação necessária → Sucesso.
// Only the movement's own facts are shown; no earned value, payable or balance (05 §4).
// Steps are history entries; typed data is never dropped without "Descartar?" (useFlow, the mobile back contract).
// Offline (ADR-0010 §3, Offline 6): the same steps from the device's lists; the last step saves a draft on this phone
// (no PIN). A draft (?rascunho=…) is confirmed online with the live confirmer/PIN and its original capture time.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { ConfirmerPicker } from '../../modules/org/ConfirmerPicker'
import { isPinError } from '../../modules/org/verifyMessages'
import { useVerifiedCommand } from '../../modules/org/useVerifiedCommand'
import { isBlockedDraft, type MovementDraft } from '../../modules/movements/drafts'
import { useDraftActions, useDraftParam, useMovementData } from '../../modules/movements/useMovement'
import type { CapturePerson } from '../../modules/services/api'
import { recordAdvance, type RecordAdvanceInput, type RecordAdvanceResult } from '../../modules/team/api'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { AmountField } from '../../shared/ui/AmountField'
import { formatMoney, minorToWholeUnits, wholeUnitsToMinor } from '../../shared/money'
import { formatWhen } from '../../shared/time'
import { AppBar, AppScreen, BottomActionBar, LockIcon } from '../../shared/ui/AppShell'
import { Field } from '../../shared/ui/Field'
import { Icon } from '../../shared/ui/Icon'
import { useFlow } from '../../shared/ui/navigation'
import { PaymentFields } from '../../shared/ui/PaymentFields'
import { effectiveChoice, type PaymentChoice } from '../../shared/payment'
import { DraftBlocked, DraftLoading, DraftMissing, DraftNotes, DraftSaved, DraftSaveStep } from '../rascunhos/DraftUi'
import { draftFailure, MOVEMENT_BLOCKED } from '../rascunhos/copy'

export function AdvanceFlow() {
  const d = useDraftParam('advance')
  const lists = useMovementData('advance')
  // a draft opens on its last step: wait for its lists, or the step would look incomplete and fall back to the first
  if (d.status === 'loading' || (d.status === 'ready' && lists.loading)) return <DraftLoading title="Adiantamento" />
  if (d.status === 'missing') return <DraftMissing title="Adiantamento" />
  return <AdvanceForm key={d.draftId ?? 'new'} draft={d.draft} />
}

function AdvanceForm({ draft }: { draft: MovementDraft<'advance'> | null }) {
  const org = useOrganization()
  const navigate = useNavigate()
  const lists = useMovementData('advance')
  const drafts = useDraftActions('advance', draft)
  const advance = useVerifiedCommand<RecordAdvanceInput, RecordAdvanceResult>(drafts.wrapRun(recordAdvance), { intent: drafts.intent })
  const saved = drafts.save

  const f = draft?.payload.form
  const [person, setPerson] = useState<CapturePerson | null>(f?.person ?? null)
  const [amount, setAmount] = useState(f ? String(minorToWholeUnits(f.amountMinor, org)) : '')
  const [method, setMethod] = useState<PaymentChoice>(f?.paymentMethodId ?? null)
  const [note, setNote] = useState(f?.note ?? '')
  const [confirmerId, setConfirmerId] = useState<string | null>(null)
  const [secret, setSecret] = useState('')
  const [askDiscard, setAskDiscard] = useState(false)

  const offline = lists.offline
  const blockedDraft = isBlockedDraft(draft)
  const amountMinor = wholeUnitsToMinor(amount, org)
  // the organization's own active methods; advances are paid with one method (no Misto, Slice 02 #7)
  const methodList = lists.data.paymentMethods ?? []
  const methodRow = methodList.find((m) => m.id === effectiveChoice(method, methodList))

  const input: RecordAdvanceInput | null =
    person && amountMinor && amountMinor > 0 && methodRow
      ? { personId: person.id, amountMinor, paymentMethodId: methodRow.id, note: note.trim() || null }
      : null
  const form = input && person ? { person: { id: person.id, display_name: person.display_name, capabilities: person.capabilities },
    amountMinor: input.amountMinor, paymentMethodId: input.paymentMethodId, note: input.note } : null
  const hasData = draft ? JSON.stringify(form) !== JSON.stringify(f) : amount !== '' || note.trim() !== ''

  const flow = useFlow({ steps: 3, parent: draft ? '/rascunhos' : '/', dirty: hasData, reachable: (n) => (n === 2 ? person !== null : input !== null) })
  const step = flow.step

  function leaveNow() {
    advance.reset(); setSecret('')
    flow.leaveTo('/')
  }
  function confirm() {
    if (!input || !confirmerId || !secret) return
    advance.confirm({ input, confirmerId, secret }, { onSuccess: () => { setSecret(''); flow.finish() } })
  }
  function saveDraft() {
    if (!form || !person) return
    saved.mutate({ form, display: { title: person.display_name, amount_minor: form.amountMinor } }, { onSuccess: () => flow.finish() })
  }
  function startOver() {
    advance.reset(); saved.reset()
    setPerson(null); setAmount(''); setMethod(null); setNote(''); setConfirmerId(null); setSecret('')
    if (draft) navigate('/equipa/adiantamento', { replace: true }); else flow.restart()
  }

  if (flow.completed && person && saved.data && amountMinor) {
    return <DraftSaved summary={`${person.display_name} · ${formatMoney(amountMinor, org)} · ${methodRow?.label ?? ''}`}
      when={formatWhen(saved.data.capturedAt, org.timezone)} onHoje={() => { saved.reset(); flow.leaveTo('/') }}
      onAnother={startOver} anotherLabel="Guardar outro adiantamento" />
  }

  if (flow.completed && person && advance.result && amountMinor) {
    return (
      <AppScreen actions={
        <BottomActionBar>
          <button className="btn btn-primary btn-tall" onClick={leaveNow}>Voltar a Hoje</button>
          <button className="btn btn-secondary" onClick={startOver}>Registar outro adiantamento</button>
        </BottomActionBar>
      }>
        <div className="stack center success">
          <span aria-hidden className="success-mark"><Icon name="check" size={34} strokeWidth={2.5} /></span>
          <h2>Adiantamento registado com sucesso.</h2>
          <p className="note num">{person.display_name} · {formatMoney(amountMinor, org)} · {methodRow?.label}</p>
          <p className="note num">{capitalized(formatWhen(advance.result.occurred_at, org.timezone))}</p>
          <button className="link-btn" onClick={() => navigate(`/registos/anular/advance/${advance.result!.advance_id}`)}>Corrigir este registo</button>
        </div>
      </AppScreen>
    )
  }

  const otherDomainError = advance.status === 'error' && advance.error?.kind !== 'network' && !isPinError(advance.error)

  const footer = step === 2 && person ? (
    <BottomActionBar>
      <span className="bar-summary">
        {amountMinor ? `Para ${person.display_name} · ${formatMoney(amountMinor, org)} · ${methodRow?.label ?? ''}` : 'Indique o valor para continuar.'}
      </span>
      <button className="btn btn-primary btn-tall" disabled={!input} onClick={() => flow.goTo(3)}>Continuar</button>
    </BottomActionBar>
  ) : step === 3 && input && offline ? (
    <BottomActionBar>
      <button className="btn btn-primary btn-tall" onClick={saveDraft} disabled={saved.isPending}>{saved.isPending ? 'A guardar…' : 'Guardar neste telemóvel'}</button>
    </BottomActionBar>
  ) : step === 3 && input && !blockedDraft ? (
    <BottomActionBar>
      {advance.status === 'error' && advance.error?.kind === 'network' ? (
        <>
          <button className="btn btn-primary btn-tall" onClick={confirm}>Tentar novamente</button>
          <button className="btn btn-secondary" onClick={flow.exit}>{draft ? 'Sair (o rascunho fica guardado)' : 'Sair sem guardar'}</button>
        </>
      ) : (
        <button className="btn btn-primary btn-tall" onClick={confirm} disabled={!confirmerId || !secret || advance.status === 'pending'}>
          {advance.status === 'pending' ? 'A confirmar…' : 'Confirmar adiantamento'}
        </button>
      )}
    </BottomActionBar>
  ) : undefined

  const summary = input && person && (
    <dl className="kv-card">
      <div><dt>Para</dt><dd>{person.display_name}</dd></div>
      <div><dt>Valor</dt><dd className="num">{formatMoney(input.amountMinor, org)}</dd></div>
      <div><dt>Forma de entrega</dt><dd>{methodRow?.label}</dd></div>
      {input.note && <div><dt>Nota</dt><dd>{input.note}</dd></div>}
      {draft && <div><dt>Guardado</dt><dd className="num">{formatWhen(draft.capturedAt, org.timezone)}</dd></div>}
    </dl>
  )

  return (
    <AppScreen
      bar={<AppBar title="Adiantamento" leading={step === 1 ? 'close' : 'back'} onLeading={step === 1 ? flow.exit : () => flow.goTo(step - 1)} step={{ current: step, total: 3 }} />}
      actions={footer}>

      {step === 1 && (
        <section className="stack">
          <h2>Adiantamento para quem?</h2>
          {lists.blocked && <div className="notice notice-neutral" role="status" data-testid="offline-blocked">{MOVEMENT_BLOCKED[lists.blocked]}</div>}
          <div className="tiles">
            {lists.data.people?.map((p) => (
              <button key={p.id} className="tile" aria-current={p.id === person?.id || undefined} onClick={() => { setPerson(p); flow.goTo(2) }}>
                <strong>{p.display_name}</strong>
                <span className="support">{p.capabilities.join(' · ')}</span>
              </button>
            ))}
          </div>
          <p className="note support">
            Dinheiro entregue a uma pessoa da equipa por conta do que vai receber. Não é uma despesa do salão.
          </p>
        </section>
      )}

      {step === 2 && person && (
        <>
          <section className="stack stack-loose">
            <h2>Quanto e como?</h2>
            <div><button className="chip" onClick={() => flow.goTo(1)} aria-label={`Mudar pessoa: ${person.display_name}`}>{person.display_name}<Icon name="edit" size={16} /></button></div>
            <AmountField label="Valor entregue" hint={`Valor em ${org.currency_symbol}, sem cêntimos.`} value={amount} onChange={setAmount} symbol={org.currency_symbol} />
            <PaymentFields label="Forma de entrega" methods={methodList} choice={methodRow?.id ?? null} onChoice={setMethod}
              allowMixed={false} symbol={org.currency_symbol} />
            <Field label="Nota (opcional)">
              <input maxLength={60} enterKeyHint="done" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </section>
        </>
      )}

      {step === 3 && person && input && offline && (
        <DraftSaveStep what="o adiantamento">
          {summary}
          {saved.isError && <div className="notice notice-error" role="alert">Não foi possível guardar neste telemóvel. Os dados continuam aqui.</div>}
        </DraftSaveStep>
      )}

      {step === 3 && person && input && !offline && (
        <>
          <section className="stack stack-loose">
            <h2>Confirmação necessária</h2>
            <p className="note">Este adiantamento tem de ser confirmado por uma pessoa autorizada.</p>
            <DraftNotes draft={draft} />
            {summary}
            <div className="lock-note">
              <LockIcon />
              <span>Fica no histórico com data, hora e quem confirmou. É descontado ao valor a receber no fecho do período.</span>
            </div>
            {blockedDraft && draft ? <DraftBlocked draft={draft} onDiscard={() => setAskDiscard(true)} /> : (
              <ConfirmerPicker confirmerId={confirmerId} onConfirmer={setConfirmerId} secret={secret} onSecret={setSecret}
                error={advance.status === 'error' ? advance.error : null} />
            )}
            {advance.status === 'error' && advance.error?.kind === 'network' && (
              <div className="notice notice-error" role="alert">Não foi possível guardar. Os dados continuam aqui.</div>
            )}
            {otherDomainError && <div className="notice notice-error" role="alert">{draftFailure(advance.error, 'Não foi possível guardar este adiantamento.')}</div>}
            {draft && !blockedDraft && <button className="link-btn self-start" onClick={() => setAskDiscard(true)}>Descartar rascunho</button>}
          </section>
        </>
      )}

      <DiscardSheet open={flow.discard.open} title={draft ? 'Sair sem guardar as alterações?' : 'Descartar este adiantamento?'} onDiscard={flow.discard.confirm} onKeep={flow.discard.cancel} />
      <DiscardSheet open={askDiscard} title="Descartar este rascunho?" detail="Só é apagado deste telemóvel. Nada foi registado."
        onKeep={() => setAskDiscard(false)} onDiscard={() => { setAskDiscard(false); drafts.discard.mutate(undefined, { onSuccess: () => flow.finishTo('/rascunhos') }) }} />
    </AppScreen>
  )
}

const capitalized = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
