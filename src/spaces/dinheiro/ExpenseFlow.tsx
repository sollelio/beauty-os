// Registar despesa (Slice 03 §4): Que despesa? → Quanto e como? → Confirmação necessária → Sucesso.
// Steps are history entries; typed data is never dropped without "Descartar?" (useFlow, the mobile back contract).
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { ConfirmerPicker } from '../../modules/org/ConfirmerPicker'
import { isPinError } from '../../modules/org/verifyMessages'
import { useVerifiedCommand } from '../../modules/org/useVerifiedCommand'
import { listExpenseCategories, moneyKeys, recordExpense, type ExpenseCategory, type RecordExpenseInput, type RecordExpenseResult } from '../../modules/money/api'
import { listPaymentMethods, servicesKeys } from '../../modules/services/api'
import { checkPayment, choiceLabel, effectiveChoice, MIXED, paymentParts, type PaymentChoice } from '../../shared/payment'
import { formatMoney, wholeUnitsToMinor } from '../../shared/money'
import { formatTime } from '../../shared/time'
import { AmountField } from '../../shared/ui/AmountField'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { PaymentFields } from '../../shared/ui/PaymentFields'
import { captureFailure } from '../../shared/periodLock'
import { AppBar, AppScreen, BottomActionBar, LockIcon } from '../../shared/ui/AppShell'
import { useFlow } from '../../shared/ui/navigation'

export function ExpenseFlow() {
  const org = useOrganization()
  const navigate = useNavigate()
  const command = useVerifiedCommand<RecordExpenseInput, RecordExpenseResult>(recordExpense)

  const [category, setCategory] = useState<ExpenseCategory | null>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentChoice>(null)
  const [mixed, setMixed] = useState<[string, string]>(['', ''])
  const [note, setNote] = useState('')
  const [confirmerId, setConfirmerId] = useState<string | null>(null)
  const [secret, setSecret] = useState('')

  const categories = useQuery({ queryKey: moneyKeys.categories, queryFn: listExpenseCategories })
  const methods = useQuery({ queryKey: servicesKeys.paymentMethods, queryFn: listPaymentMethods })

  const amountMinor = wholeUnitsToMinor(amount, org)
  const mixedMinor: [number | null, number | null] = [wholeUnitsToMinor(mixed[0], org), wholeUnitsToMinor(mixed[1], org)]
  // the organization's own active methods (codes and labels are tenant data); the first is preselected
  const methodList = methods.data ?? []
  const choice = effectiveChoice(method, methodList)
  const check = checkPayment(amountMinor, choice === MIXED ? 'mixed' : 'single', mixedMinor, org)
  const methodText = choiceLabel(choice, methodList)
  const hasData = amount !== '' || note.trim() !== '' || mixed[0] !== '' || mixed[1] !== ''

  const payments = paymentParts(choice, methodList, amountMinor, mixedMinor)
  const input: RecordExpenseInput | null = category && amountMinor && amountMinor > 0 && check.valid && payments
    ? { categoryId: category.id, amountMinor, payments, note: note.trim() || null } : null

  const flow = useFlow({ steps: 3, parent: '/', dirty: hasData, reachable: (n) => (n === 2 ? category !== null : input !== null) })
  const step = flow.step

  function leaveNow() { command.reset(); setSecret(''); flow.leaveTo('/') }
  function confirm() {
    if (!input || !confirmerId || !secret) return
    command.confirm({ input, confirmerId, secret }, { onSuccess: () => { setSecret(''); flow.finish() } })
  }
  function startOver() {
    command.reset()
    setCategory(null); setAmount(''); setMethod(null); setMixed(['', '']); setNote(''); setConfirmerId(null); setSecret('')
    flow.restart()
  }

  if (flow.completed && category && command.result && amountMinor) {
    return (
      <AppScreen actions={
        <BottomActionBar>
          <button className="btn btn-primary btn-tall" onClick={leaveNow}>Voltar a Hoje</button>
          <button className="btn btn-secondary" onClick={startOver}>Registar outra despesa</button>
        </BottomActionBar>
      }>
        <div className="stack center" style={{ marginTop: '3rem', gap: '0.75rem' }}>
          <span aria-hidden className="success-mark">✓</span>
          <h2>Despesa registada com sucesso.</h2>
          <p className="muted num" style={{ margin: 0 }}>{category.label} · {formatMoney(amountMinor, org)} · {methodText}</p>
          <p className="muted num" style={{ margin: 0 }}>Hoje às {formatTime(command.result.occurred_at, org.timezone)}</p>
          <button className="link-btn" onClick={() => navigate(`/registos/anular/expense/${command.result!.expense_id}`)}>Corrigir este registo</button>
        </div>
      </AppScreen>
    )
  }

  const err = command.status === 'error' ? command.error : null
  const footer = step === 2 && category ? (
    <BottomActionBar>
      <span className="muted num" style={{ textAlign: 'center' }}>
        {amountMinor ? `${category.label} · ${formatMoney(amountMinor, org)} · ${methodText}` : 'Indique o valor para continuar.'}
      </span>
      <button className="btn btn-primary btn-tall" disabled={!input} onClick={() => flow.goTo(3)}>Continuar</button>
    </BottomActionBar>
  ) : step === 3 && category && input ? (
    <BottomActionBar>
      {err?.kind === 'network' ? (
        <>
          <button className="btn btn-primary btn-tall" onClick={confirm}>Tentar novamente</button>
          <button className="btn btn-secondary" onClick={flow.exit}>Sair sem guardar</button>
        </>
      ) : (
        <button className="btn btn-primary btn-tall" onClick={confirm} disabled={!confirmerId || !secret || command.status === 'pending'}>
          {command.status === 'pending' ? 'A confirmar…' : 'Confirmar despesa'}
        </button>
      )}
    </BottomActionBar>
  ) : undefined

  return (
    <AppScreen
      bar={<AppBar title="Despesa" leading={step === 1 ? 'close' : 'back'} onLeading={step === 1 ? flow.exit : () => flow.goTo(step - 1)} step={{ current: step, total: 3 }} />}
      actions={footer}>

      {step === 1 && (
        <section className="stack">
          <h2>Que despesa?</h2>
          <div className="tiles">
            {categories.data?.map((c) => (
              <button key={c.id} className="tile" style={{ minHeight: '6.5rem' }} onClick={() => { setCategory(c); flow.goTo(2) }}>
                <strong>{c.label}</strong>
                {c.hint && <span className="muted" style={{ fontSize: '0.875rem' }}>{c.hint}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && category && (
        <>
          <section className="stack" style={{ gap: '1rem' }}>
            <h2>Quanto e como?</h2>
            <div><button className="chip" onClick={() => flow.goTo(1)} aria-label={`Mudar despesa: ${category.label}`}>{category.label} ✎</button></div>
            <div className="stack" style={{ gap: '0.375rem' }}>
              <span className="label">Valor pago</span>
              <AmountField label="Valor pago" value={amount} onChange={setAmount} symbol={org.currency_symbol} />
            </div>
            <PaymentFields label="Forma de pagamento" methods={methodList} choice={choice} onChoice={setMethod} mixed={mixed} onMixed={setMixed}
              sentence={choice === MIXED ? check.sentence : null} symbol={org.currency_symbol} />
            <div className="stack" style={{ gap: '0.375rem' }}>
              <span className="label">Nota (opcional)</span>
              <label className="field"><input aria-label="Nota (opcional)" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            </div>
          </section>
        </>
      )}

      {step === 3 && category && input && (
        <>
          <section className="stack" style={{ gap: '1rem' }}>
            <h2>Confirmação necessária</h2>
            <p className="muted" style={{ margin: 0 }}>Esta despesa tem de ser confirmada por uma pessoa autorizada.</p>
            <dl className="kv-card">
              <div><dt>Despesa</dt><dd>{category.label}</dd></div>
              <div><dt>Valor</dt><dd className="num">{formatMoney(input.amountMinor, org)}</dd></div>
              <div><dt>Forma de pagamento</dt><dd>{methodText}</dd></div>
              {input.note && <div><dt>Nota</dt><dd>{input.note}</dd></div>}
            </dl>
            <div className="lock-note"><LockIcon /><span>Fica no histórico com data, hora e quem confirmou. Conta como despesa do salão em Dinheiro.</span></div>
            <ConfirmerPicker confirmerId={confirmerId} onConfirmer={setConfirmerId} secret={secret} onSecret={setSecret} error={err} />
            {err?.kind === 'network' && <div className="notice notice-error" role="alert">Não foi possível guardar. Os dados continuam aqui.</div>}
            {err && err.kind !== 'network' && !isPinError(err) && <div className="notice notice-error" role="alert">{captureFailure(err, 'Não foi possível guardar esta despesa.')}</div>}
          </section>
        </>
      )}

      <DiscardSheet open={flow.discard.open} title="Descartar esta despesa?" onDiscard={flow.discard.confirm} onKeep={flow.discard.cancel} />
    </AppScreen>
  )
}
