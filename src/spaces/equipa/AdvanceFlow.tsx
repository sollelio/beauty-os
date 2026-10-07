// Adiantamento (Slice 02 §4): para quem? → Quanto e como? → Confirmação necessária → Sucesso.
// Only the movement's own facts are shown; no earned value, payable or balance (05 §4).
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { ConfirmerPicker } from '../../modules/org/ConfirmerPicker'
import { VERIFY_MESSAGES } from '../../modules/org/verifyMessages'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { AmountField } from '../../shared/ui/AmountField'
import { listCapturePeople, listPaymentMethods, servicesKeys, type CapturePerson } from '../../modules/services/api'
import { useRecordAdvance } from '../../modules/team/useRecordAdvance'
import type { RecordAdvanceInput } from '../../modules/team/api'
import { formatMoney, wholeUnitsToMinor } from '../../shared/money'
import { formatTime } from '../../shared/time'
import { captureFailure } from '../../shared/periodLock'

type Step = 1 | 2 | 3 | 'done'
type Method = 'numerario' | 'transferencia'

export function AdvanceFlow() {
  const org = useOrganization()
  const navigate = useNavigate()
  const advance = useRecordAdvance()

  const [step, setStep] = useState<Step>(1)
  const [person, setPerson] = useState<CapturePerson | null>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Method>('numerario')
  const [note, setNote] = useState('')
  const [confirmerId, setConfirmerId] = useState<string | null>(null)
  const [secret, setSecret] = useState('')
  const [discarding, setDiscarding] = useState(false)

  const people = useQuery({ queryKey: servicesKeys.people, queryFn: listCapturePeople })
  const methods = useQuery({ queryKey: servicesKeys.paymentMethods, queryFn: listPaymentMethods })

  const amountMinor = wholeUnitsToMinor(amount, org)
  const methodRow = methods.data?.find((m) => m.code === method)
  const hasData = amount !== '' || note.trim() !== ''

  const input: RecordAdvanceInput | null =
    person && amountMinor && amountMinor > 0 && methodRow
      ? { personId: person.id, amountMinor, paymentMethodId: methodRow.id, note: note.trim() || null }
      : null

  function leaveNow() {
    advance.reset(); setSecret('')
    navigate('/')
  }
  function requestLeave() {
    if (hasData) setDiscarding(true)
    else leaveNow()
  }
  function confirm() {
    if (!input || !confirmerId || !secret) return
    advance.confirm({ input, confirmerId, secret }, { onSuccess: () => { setSecret(''); setStep('done') } })
  }
  function startOver() {
    advance.reset()
    setStep(1); setPerson(null); setAmount(''); setMethod('numerario'); setNote(''); setConfirmerId(null); setSecret('')
  }

  if (step === 'done' && person && advance.result && amountMinor) {
    return (
      <main className="app-main">
        <div className="stack center" style={{ marginTop: '3rem', gap: '0.75rem' }}>
          <span aria-hidden className="success-mark">✓</span>
          <h2>Adiantamento registado com sucesso.</h2>
          <p className="muted num" style={{ margin: 0 }}>{person.display_name} · {formatMoney(amountMinor, org)} · {methodRow?.label}</p>
          <p className="muted num" style={{ margin: 0 }}>Hoje às {formatTime(advance.result.occurred_at, org.timezone)}</p>
          <button className="link-btn" onClick={() => navigate(`/registos/anular/advance/${advance.result!.advance_id}`)}>Corrigir este registo</button>
        </div>
        <div className="footer">
          <button className="btn btn-primary btn-tall" onClick={leaveNow}>Voltar a Hoje</button>
          <button className="btn btn-secondary" onClick={startOver}>Registar outro adiantamento</button>
        </div>
      </main>
    )
  }

  const stepNo = step === 'done' ? 3 : step
  const verifyError = advance.status === 'error' && advance.error?.kind === 'domain' ? (advance.error.code && VERIFY_MESSAGES[advance.error.code]) : null
  const otherDomainError = advance.status === 'error' && advance.error?.kind !== 'network' && !verifyError

  return (
    <main className="app-main">
      <header className="flow-header">
        <div className="flow-header-row">
          {stepNo === 1
            ? <button className="icon-btn" aria-label="Fechar" onClick={requestLeave}>×</button>
            : <button className="icon-btn" aria-label="Voltar" onClick={() => setStep((stepNo - 1) as Step)}>←</button>}
          <span className="muted" style={{ fontWeight: 600 }}>Adiantamento</span>
          <span className="label num" style={{ width: '2.75rem', textAlign: 'right' }}>{stepNo} / 3</span>
        </div>
        <div className="progress" aria-hidden>{[1, 2, 3].map((n) => <span key={n} className={n <= stepNo ? 'on' : ''} />)}</div>
      </header>

      {step === 1 && (
        <section className="stack">
          <h2>Adiantamento para quem?</h2>
          <div className="tiles">
            {people.data?.map((p) => (
              <button key={p.id} className="tile" onClick={() => { setPerson(p); setStep(2) }}>
                <strong>{p.display_name}</strong>
                <span className="muted" style={{ fontSize: '0.875rem' }}>{p.capabilities.join(' · ')}</span>
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: '0.9rem', margin: 0 }}>
            Dinheiro entregue a uma pessoa da equipa por conta do que vai receber. Não é uma despesa do salão.
          </p>
        </section>
      )}

      {step === 2 && person && (
        <>
          <section className="stack" style={{ gap: '1rem' }}>
            <h2>Quanto e como?</h2>
            <div><button className="chip" onClick={() => setStep(1)} aria-label={`Mudar pessoa: ${person.display_name}`}>{person.display_name} ✎</button></div>
            <div className="stack" style={{ gap: '0.375rem' }}>
              <span className="label">Valor entregue</span>
              <AmountField label="Valor entregue" value={amount} onChange={setAmount} symbol={org.currency_symbol} />
              <span className="muted" style={{ fontSize: '0.875rem' }}>Valor em {org.currency_symbol}, sem cêntimos.</span>
            </div>
            <div className="stack">
              <span className="label">Forma de entrega</span>
              <div className="segmented" role="group" aria-label="Forma de entrega">
                {([['numerario', 'Numerário'], ['transferencia', 'Transferência']] as const).map(([code, label]) => (
                  <button key={code} className="seg" aria-pressed={method === code} onClick={() => setMethod(code)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="stack" style={{ gap: '0.375rem' }}>
              <span className="label">Nota (opcional)</span>
              <label className="field">
                <input aria-label="Nota (opcional)" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
          </section>
          <div className="footer">
            <span className="muted num" style={{ textAlign: 'center' }}>
              {amountMinor ? `Para ${person.display_name} · ${formatMoney(amountMinor, org)} · ${methodRow?.label ?? ''}` : 'Indique o valor para continuar.'}
            </span>
            <button className="btn btn-primary btn-tall" disabled={!input} onClick={() => setStep(3)}>Continuar</button>
          </div>
        </>
      )}

      {step === 3 && person && input && (
        <>
          <section className="stack" style={{ gap: '1rem' }}>
            <h2>Confirmação necessária</h2>
            <p className="muted" style={{ margin: 0 }}>Este adiantamento tem de ser confirmado por uma pessoa autorizada.</p>
            <dl className="kv-card">
              <div><dt>Para</dt><dd>{person.display_name}</dd></div>
              <div><dt>Valor</dt><dd className="num">{formatMoney(input.amountMinor, org)}</dd></div>
              <div><dt>Forma de entrega</dt><dd>{methodRow?.label}</dd></div>
              {input.note && <div><dt>Nota</dt><dd>{input.note}</dd></div>}
            </dl>
            <div className="lock-note">
              <span aria-hidden>🔒</span>
              <span>Fica no histórico com data, hora e quem confirmou. É descontado ao valor a receber no fecho do período.</span>
            </div>
            <ConfirmerPicker confirmerId={confirmerId} onConfirmer={setConfirmerId} secret={secret} onSecret={setSecret} />
            {verifyError && <div className="notice notice-error" role="alert">{verifyError}</div>}
            {advance.status === 'error' && advance.error?.kind === 'network' && (
              <div className="notice notice-error" role="alert">Não foi possível guardar. Os dados continuam aqui.</div>
            )}
            {otherDomainError && <div className="notice notice-error" role="alert">{captureFailure(advance.error, 'Não foi possível guardar este adiantamento.')}</div>}
          </section>
          <div className="footer">
            {advance.status === 'error' && advance.error?.kind === 'network' ? (
              <>
                <button className="btn btn-primary btn-tall" onClick={confirm}>Tentar novamente</button>
                <button className="btn btn-secondary" onClick={() => setDiscarding(true)}>Sair sem guardar</button>
              </>
            ) : (
              <button className="btn btn-primary btn-tall" onClick={confirm} disabled={!confirmerId || !secret || advance.status === 'pending'}>
                {advance.status === 'pending' ? 'A confirmar…' : 'Confirmar adiantamento'}
              </button>
            )}
          </div>
        </>
      )}

      {discarding && <DiscardSheet title="Descartar este adiantamento?" onDiscard={leaveNow} onKeep={() => setDiscarding(false)} />}
    </main>
  )
}
