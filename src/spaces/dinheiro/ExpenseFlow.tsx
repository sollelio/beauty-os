// Registar despesa (Slice 03 §4): Que despesa? → Quanto e como? → Confirmação necessária → Sucesso.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { ConfirmerPicker } from '../../modules/org/ConfirmerPicker'
import { VERIFY_MESSAGES } from '../../modules/org/verifyMessages'
import { useVerifiedCommand } from '../../modules/org/useVerifiedCommand'
import { listExpenseCategories, moneyKeys, recordExpense, type ExpenseCategory, type RecordExpenseInput, type RecordExpenseResult } from '../../modules/money/api'
import { listPaymentMethods, servicesKeys, type PaymentPart } from '../../modules/services/api'
import { checkPayment } from '../../shared/payment'
import { formatMoney, wholeUnitsToMinor } from '../../shared/money'
import { formatTime } from '../../shared/time'
import { AmountField } from '../../shared/ui/AmountField'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { PaymentFields, type PaymentChoice } from '../../shared/ui/PaymentFields'
import { captureFailure } from '../../shared/periodLock'

type Step = 1 | 2 | 3 | 'done'

export function ExpenseFlow() {
  const org = useOrganization()
  const navigate = useNavigate()
  const command = useVerifiedCommand<RecordExpenseInput, RecordExpenseResult>(recordExpense)

  const [step, setStep] = useState<Step>(1)
  const [category, setCategory] = useState<ExpenseCategory | null>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentChoice>('numerario')
  const [mixed, setMixed] = useState<[string, string]>(['', ''])
  const [note, setNote] = useState('')
  const [confirmerId, setConfirmerId] = useState<string | null>(null)
  const [secret, setSecret] = useState('')
  const [discarding, setDiscarding] = useState(false)

  const categories = useQuery({ queryKey: moneyKeys.categories, queryFn: listExpenseCategories })
  const methods = useQuery({ queryKey: servicesKeys.paymentMethods, queryFn: listPaymentMethods })

  const amountMinor = wholeUnitsToMinor(amount, org)
  const mixedMinor: [number | null, number | null] = [wholeUnitsToMinor(mixed[0], org), wholeUnitsToMinor(mixed[1], org)]
  const check = checkPayment(amountMinor, method === 'mixed' ? 'mixed' : 'single', mixedMinor, org)
  const methodId = (code: string) => methods.data?.find((m) => m.code === code)?.id
  const methodText = method === 'mixed' ? 'Misto' : methods.data?.find((m) => m.code === method)?.label ?? ''
  const hasData = amount !== '' || note.trim() !== '' || mixed[0] !== '' || mixed[1] !== ''

  let input: RecordExpenseInput | null = null
  if (category && amountMinor && amountMinor > 0 && check.valid) {
    let payments: PaymentPart[] | null = null
    if (method === 'mixed') {
      const cash = methodId('numerario'), transfer = methodId('transferencia')
      if (cash && transfer) payments = [{ method_id: cash, amount_minor: mixedMinor[0] ?? 0 }, { method_id: transfer, amount_minor: mixedMinor[1] ?? 0 }]
    } else {
      const id = methodId(method)
      if (id) payments = [{ method_id: id, amount_minor: amountMinor }]
    }
    if (payments) input = { categoryId: category.id, amountMinor, payments, note: note.trim() || null }
  }

  function leaveNow() { command.reset(); setSecret(''); navigate('/') }
  function requestLeave() { if (hasData) setDiscarding(true); else leaveNow() }
  function confirm() {
    if (!input || !confirmerId || !secret) return
    command.confirm({ input, confirmerId, secret }, { onSuccess: () => { setSecret(''); setStep('done') } })
  }
  function startOver() {
    command.reset()
    setStep(1); setCategory(null); setAmount(''); setMethod('numerario'); setMixed(['', '']); setNote(''); setConfirmerId(null); setSecret('')
  }

  if (step === 'done' && category && command.result && amountMinor) {
    return (
      <main className="app-main">
        <div className="stack center" style={{ marginTop: '3rem', gap: '0.75rem' }}>
          <span aria-hidden className="success-mark">✓</span>
          <h2>Despesa registada com sucesso.</h2>
          <p className="muted num" style={{ margin: 0 }}>{category.label} · {formatMoney(amountMinor, org)} · {methodText}</p>
          <p className="muted num" style={{ margin: 0 }}>Hoje às {formatTime(command.result.occurred_at, org.timezone)}</p>
          <button className="link-btn" onClick={() => navigate(`/registos/anular/expense/${command.result!.expense_id}`)}>Corrigir este registo</button>
        </div>
        <div className="footer">
          <button className="btn btn-primary btn-tall" onClick={leaveNow}>Voltar a Hoje</button>
          <button className="btn btn-secondary" onClick={startOver}>Registar outra despesa</button>
        </div>
      </main>
    )
  }

  const stepNo = step === 'done' ? 3 : step
  const err = command.status === 'error' ? command.error : null
  return (
    <main className="app-main">
      <header className="flow-header">
        <div className="flow-header-row">
          {stepNo === 1
            ? <button className="icon-btn" aria-label="Fechar" onClick={requestLeave}>×</button>
            : <button className="icon-btn" aria-label="Voltar" onClick={() => setStep((stepNo - 1) as Step)}>←</button>}
          <span className="muted" style={{ fontWeight: 600 }}>Despesa</span>
          <span className="label num" style={{ width: '2.75rem', textAlign: 'right' }}>{stepNo} / 3</span>
        </div>
        <div className="progress" aria-hidden>{[1, 2, 3].map((n) => <span key={n} className={n <= stepNo ? 'on' : ''} />)}</div>
      </header>

      {step === 1 && (
        <section className="stack">
          <h2>Que despesa?</h2>
          <div className="tiles">
            {categories.data?.map((c) => (
              <button key={c.id} className="tile" style={{ minHeight: '6.5rem' }} onClick={() => { setCategory(c); setStep(2) }}>
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
            <div><button className="chip" onClick={() => setStep(1)} aria-label={`Mudar despesa: ${category.label}`}>{category.label} ✎</button></div>
            <div className="stack" style={{ gap: '0.375rem' }}>
              <span className="label">Valor pago</span>
              <AmountField label="Valor pago" value={amount} onChange={setAmount} symbol={org.currency_symbol} />
            </div>
            <PaymentFields label="Forma de pagamento" method={method} onMethod={setMethod} mixed={mixed} onMixed={setMixed}
              sentence={method === 'mixed' ? check.sentence : null} symbol={org.currency_symbol} />
            <div className="stack" style={{ gap: '0.375rem' }}>
              <span className="label">Nota (opcional)</span>
              <label className="field"><input aria-label="Nota (opcional)" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            </div>
          </section>
          <div className="footer">
            <span className="muted num" style={{ textAlign: 'center' }}>
              {amountMinor ? `${category.label} · ${formatMoney(amountMinor, org)} · ${methodText}` : 'Indique o valor para continuar.'}
            </span>
            <button className="btn btn-primary btn-tall" disabled={!input} onClick={() => setStep(3)}>Continuar</button>
          </div>
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
            <div className="lock-note"><span aria-hidden>🔒</span><span>Fica no histórico com data, hora e quem confirmou. Conta como despesa do salão em Dinheiro.</span></div>
            <ConfirmerPicker confirmerId={confirmerId} onConfirmer={setConfirmerId} secret={secret} onSecret={setSecret} />
            {err?.kind === 'domain' && err.code && VERIFY_MESSAGES[err.code] && <div className="notice notice-error" role="alert">{VERIFY_MESSAGES[err.code]}</div>}
            {err?.kind === 'network' && <div className="notice notice-error" role="alert">Não foi possível guardar. Os dados continuam aqui.</div>}
            {err && err.kind !== 'network' && !(err.code && VERIFY_MESSAGES[err.code]) && <div className="notice notice-error" role="alert">{captureFailure(err, 'Não foi possível guardar esta despesa.')}</div>}
          </section>
          <div className="footer">
            {err?.kind === 'network' ? (
              <>
                <button className="btn btn-primary btn-tall" onClick={confirm}>Tentar novamente</button>
                <button className="btn btn-secondary" onClick={() => setDiscarding(true)}>Sair sem guardar</button>
              </>
            ) : (
              <button className="btn btn-primary btn-tall" onClick={confirm} disabled={!confirmerId || !secret || command.status === 'pending'}>
                {command.status === 'pending' ? 'A confirmar…' : 'Confirmar despesa'}
              </button>
            )}
          </div>
        </>
      )}

      {discarding && <DiscardSheet title="Descartar esta despesa?" onDiscard={leaveNow} onKeep={() => setDiscarding(false)} />}
    </main>
  )
}
