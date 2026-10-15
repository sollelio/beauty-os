// Registar despesa (Slice 03 §4): Que despesa? → Quanto e como? → Confirmação necessária → Sucesso.
// Steps are history entries; typed data is never dropped without "Descartar?" (useFlow, the mobile back contract).
// Offline (ADR-0010 §3, Offline 6): the same steps from the device's lists; the last step saves a draft on this phone
// (no PIN). A draft (?rascunho=…) is confirmed online with the live confirmer/PIN and its original capture time.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { ConfirmerPicker } from '../../modules/org/ConfirmerPicker'
import { isPinError } from '../../modules/org/verifyMessages'
import { useVerifiedCommand } from '../../modules/org/useVerifiedCommand'
import { recordExpense, type ExpenseCategory, type RecordExpenseInput, type RecordExpenseResult } from '../../modules/money/api'
import { isBlockedDraft, type MovementDraft } from '../../modules/movements/drafts'
import { useDraftActions, useDraftParam, useMovementData } from '../../modules/movements/useMovement'
import { checkPayment, choiceLabel, effectiveChoice, MIXED, paymentParts, type PaymentChoice } from '../../shared/payment'
import { formatMoney, minorToWholeUnits, wholeUnitsToMinor } from '../../shared/money'
import { formatWhen } from '../../shared/time'
import { AmountField } from '../../shared/ui/AmountField'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { PaymentFields } from '../../shared/ui/PaymentFields'
import { AppBar, AppScreen, BottomActionBar, LockIcon } from '../../shared/ui/AppShell'
import { Field } from '../../shared/ui/Field'
import { Icon } from '../../shared/ui/Icon'
import { useFlow } from '../../shared/ui/navigation'
import { DraftBlocked, DraftLoading, DraftMissing, DraftNotes, DraftSaved, DraftSaveStep } from '../rascunhos/DraftUi'
import { draftFailure, MOVEMENT_BLOCKED } from '../rascunhos/copy'

export function ExpenseFlow() {
  const d = useDraftParam('expense')
  const lists = useMovementData('expense')
  // a draft opens on its last step: wait for its lists, or the step would look incomplete and fall back to the first
  if (d.status === 'loading' || (d.status === 'ready' && lists.loading)) return <DraftLoading title="Despesa" />
  if (d.status === 'missing') return <DraftMissing title="Despesa" />
  return <ExpenseForm key={d.draftId ?? 'new'} draft={d.draft} />
}

function ExpenseForm({ draft }: { draft: MovementDraft<'expense'> | null }) {
  const org = useOrganization()
  const navigate = useNavigate()
  const lists = useMovementData('expense')
  const drafts = useDraftActions('expense', draft)
  const command = useVerifiedCommand<RecordExpenseInput, RecordExpenseResult>(drafts.wrapRun(recordExpense), { intent: drafts.intent })
  const saved = drafts.save

  const f = draft?.payload.form
  const digits = (minor: number) => String(minorToWholeUnits(minor, org))
  const [category, setCategory] = useState<ExpenseCategory | null>(f?.category ?? null)
  const [amount, setAmount] = useState(f ? digits(f.amountMinor) : '')
  const [method, setMethod] = useState<PaymentChoice>(f ? (f.payments.length === 2 ? MIXED : f.payments[0]?.method_id ?? null) : null)
  const [mixed, setMixed] = useState<[string, string]>(f && f.payments.length === 2 ? [digits(f.payments[0]!.amount_minor), digits(f.payments[1]!.amount_minor)] : ['', ''])
  const [note, setNote] = useState(f?.note ?? '')
  const [confirmerId, setConfirmerId] = useState<string | null>(null)
  const [secret, setSecret] = useState('')
  const [askDiscard, setAskDiscard] = useState(false)

  const offline = lists.offline
  const blockedDraft = isBlockedDraft(draft)
  const amountMinor = wholeUnitsToMinor(amount, org)
  const mixedMinor: [number | null, number | null] = [wholeUnitsToMinor(mixed[0], org), wholeUnitsToMinor(mixed[1], org)]
  // the organization's own active methods (codes and labels are tenant data); the first is preselected
  const methodList = lists.data.paymentMethods ?? []
  const choice = effectiveChoice(method, methodList)
  const check = checkPayment(amountMinor, choice === MIXED ? 'mixed' : 'single', mixedMinor, org)
  const methodText = choiceLabel(choice, methodList)

  const payments = paymentParts(choice, methodList, amountMinor, mixedMinor)
  const input: RecordExpenseInput | null = category && amountMinor && amountMinor > 0 && check.valid && payments
    ? { categoryId: category.id, amountMinor, payments, note: note.trim() || null } : null
  const form = input && category ? { category: { id: category.id, label: category.label, hint: category.hint ?? null }, amountMinor: input.amountMinor,
    payments: input.payments.map((p) => ({ method_id: p.method_id, amount_minor: p.amount_minor })), note: input.note } : null
  const hasData = draft ? JSON.stringify(form) !== JSON.stringify(f) : amount !== '' || note.trim() !== '' || mixed[0] !== '' || mixed[1] !== ''

  const flow = useFlow({ steps: 3, parent: draft ? '/rascunhos' : '/', dirty: hasData, reachable: (n) => (n === 2 ? category !== null : input !== null) })
  const step = flow.step

  function leaveNow() { command.reset(); setSecret(''); flow.leaveTo('/') }
  function confirm() {
    if (!input || !confirmerId || !secret) return
    command.confirm({ input, confirmerId, secret }, { onSuccess: () => { setSecret(''); flow.finish() } })
  }
  function saveDraft() {
    if (!form || !category) return
    saved.mutate({ form, display: { title: category.label, amount_minor: form.amountMinor } }, { onSuccess: () => flow.finish() })
  }
  function startOver() {
    command.reset(); saved.reset()
    setCategory(null); setAmount(''); setMethod(null); setMixed(['', '']); setNote(''); setConfirmerId(null); setSecret('')
    if (draft) navigate('/dinheiro/despesa', { replace: true }); else flow.restart()
  }

  if (flow.completed && category && saved.data && amountMinor) {
    return <DraftSaved summary={`${category.label} · ${formatMoney(amountMinor, org)} · ${methodText}`}
      when={formatWhen(saved.data.capturedAt, org.timezone)} onHoje={() => { saved.reset(); flow.leaveTo('/') }}
      onAnother={startOver} anotherLabel="Guardar outra despesa" />
  }

  if (flow.completed && category && command.result && amountMinor) {
    return (
      <AppScreen actions={
        <BottomActionBar>
          <button className="btn btn-primary btn-tall" onClick={leaveNow}>Voltar a Hoje</button>
          <button className="btn btn-secondary" onClick={startOver}>Registar outra despesa</button>
        </BottomActionBar>
      }>
        <div className="stack center success">
          <span aria-hidden className="success-mark"><Icon name="check" size={34} strokeWidth={2.5} /></span>
          <h2>Despesa registada com sucesso.</h2>
          <p className="note num">{category.label} · {formatMoney(amountMinor, org)} · {methodText}</p>
          <p className="note num">{capitalized(formatWhen(command.result.occurred_at, org.timezone))}</p>
          <button className="link-btn" onClick={() => navigate(`/registos/anular/expense/${command.result!.expense_id}`)}>Corrigir este registo</button>
        </div>
      </AppScreen>
    )
  }

  const err = command.status === 'error' ? command.error : null
  const footer = step === 2 && category ? (
    <BottomActionBar>
      <span className="bar-summary">
        {amountMinor ? `${category.label} · ${formatMoney(amountMinor, org)} · ${methodText}` : 'Indique o valor para continuar.'}
      </span>
      <button className="btn btn-primary btn-tall" disabled={!input} onClick={() => flow.goTo(3)}>Continuar</button>
    </BottomActionBar>
  ) : step === 3 && category && input && offline ? (
    <BottomActionBar>
      <button className="btn btn-primary btn-tall" onClick={saveDraft} disabled={saved.isPending}>{saved.isPending ? 'A guardar…' : 'Guardar neste telemóvel'}</button>
    </BottomActionBar>
  ) : step === 3 && category && input && !blockedDraft ? (
    <BottomActionBar>
      {err?.kind === 'network' ? (
        <>
          <button className="btn btn-primary btn-tall" onClick={confirm}>Tentar novamente</button>
          <button className="btn btn-secondary" onClick={flow.exit}>{draft ? 'Sair (o rascunho fica guardado)' : 'Sair sem guardar'}</button>
        </>
      ) : (
        <button className="btn btn-primary btn-tall" onClick={confirm} disabled={!confirmerId || !secret || command.status === 'pending'}>
          {command.status === 'pending' ? 'A confirmar…' : 'Confirmar despesa'}
        </button>
      )}
    </BottomActionBar>
  ) : undefined

  const summary = input && category && (
    <dl className="kv-card">
      <div><dt>Despesa</dt><dd>{category.label}</dd></div>
      <div><dt>Valor</dt><dd className="num">{formatMoney(input.amountMinor, org)}</dd></div>
      <div><dt>Forma de pagamento</dt><dd>{methodText}</dd></div>
      {input.note && <div><dt>Nota</dt><dd>{input.note}</dd></div>}
      {draft && <div><dt>Guardado</dt><dd className="num">{formatWhen(draft.capturedAt, org.timezone)}</dd></div>}
    </dl>
  )

  return (
    <AppScreen
      bar={<AppBar title="Despesa" leading={step === 1 ? 'close' : 'back'} onLeading={step === 1 ? flow.exit : () => flow.goTo(step - 1)} step={{ current: step, total: 3 }} />}
      actions={footer}>

      {step === 1 && (
        <section className="stack">
          <h2>Que despesa?</h2>
          {lists.blocked && <div className="notice notice-neutral" role="status" data-testid="offline-blocked">{MOVEMENT_BLOCKED[lists.blocked]}</div>}
          <div className="tiles">
            {lists.data.expenseCategories?.map((c) => (
              <button key={c.id} className="tile tile-short" aria-current={c.id === category?.id || undefined} onClick={() => { setCategory(c); flow.goTo(2) }}>
                <strong>{c.label}</strong>
                {c.hint && <span className="support">{c.hint}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && category && (
        <>
          <section className="stack stack-loose">
            <h2>Quanto e como?</h2>
            <div><button className="chip" onClick={() => flow.goTo(1)} aria-label={`Mudar despesa: ${category.label}`}>{category.label}<Icon name="edit" size={16} /></button></div>
            <AmountField label="Valor pago" value={amount} onChange={setAmount} symbol={org.currency_symbol} />
            <PaymentFields label="Forma de pagamento" methods={methodList} choice={choice} onChoice={setMethod} mixed={mixed} onMixed={setMixed}
              sentence={choice === MIXED ? check.sentence : null} symbol={org.currency_symbol} />
            <Field label="Nota (opcional)">
              <input maxLength={60} enterKeyHint="done" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </section>
        </>
      )}

      {step === 3 && category && input && offline && (
        <DraftSaveStep what="a despesa">
          {summary}
          {saved.isError && <div className="notice notice-error" role="alert">Não foi possível guardar neste telemóvel. Os dados continuam aqui.</div>}
        </DraftSaveStep>
      )}

      {step === 3 && category && input && !offline && (
        <>
          <section className="stack stack-loose">
            <h2>Confirmação necessária</h2>
            <p className="note">Esta despesa tem de ser confirmada por uma pessoa autorizada.</p>
            <DraftNotes draft={draft} />
            {summary}
            <div className="lock-note"><LockIcon /><span>Fica no histórico com data, hora e quem confirmou. Conta como despesa do salão em Dinheiro.</span></div>
            {blockedDraft && draft ? <DraftBlocked draft={draft} onDiscard={() => setAskDiscard(true)} /> : (
              <ConfirmerPicker confirmerId={confirmerId} onConfirmer={setConfirmerId} secret={secret} onSecret={setSecret} error={err} />
            )}
            {err?.kind === 'network' && <div className="notice notice-error" role="alert">Não foi possível guardar. Os dados continuam aqui.</div>}
            {err && err.kind !== 'network' && !isPinError(err) && <div className="notice notice-error" role="alert">{draftFailure(err, 'Não foi possível guardar esta despesa.')}</div>}
            {draft && !blockedDraft && <button className="link-btn self-start" onClick={() => setAskDiscard(true)}>Descartar rascunho</button>}
          </section>
        </>
      )}

      <DiscardSheet open={flow.discard.open} title={draft ? 'Sair sem guardar as alterações?' : 'Descartar esta despesa?'} onDiscard={flow.discard.confirm} onKeep={flow.discard.cancel} />
      <DiscardSheet open={askDiscard} title="Descartar este rascunho?" detail="Só é apagado deste telemóvel. Nada foi registado."
        onKeep={() => setAskDiscard(false)} onDiscard={() => { setAskDiscard(false); drafts.discard.mutate(undefined, { onSuccess: () => flow.finishTo('/rascunhos') }) }} />
    </AppScreen>
  )
}

const capitalized = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
