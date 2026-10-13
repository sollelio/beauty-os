// Adiantamento (Slice 02 §4): para quem? → Quanto e como? → Confirmação necessária → Sucesso.
// Only the movement's own facts are shown; no earned value, payable or balance (05 §4).
// Steps are history entries; typed data is never dropped without "Descartar?" (useFlow, the mobile back contract).
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { ConfirmerPicker } from '../../modules/org/ConfirmerPicker'
import { isPinError } from '../../modules/org/verifyMessages'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { AmountField } from '../../shared/ui/AmountField'
import { listCapturePeople, listPaymentMethods, servicesKeys, type CapturePerson } from '../../modules/services/api'
import { useRecordAdvance } from '../../modules/team/useRecordAdvance'
import type { RecordAdvanceInput } from '../../modules/team/api'
import { formatMoney, wholeUnitsToMinor } from '../../shared/money'
import { formatTime } from '../../shared/time'
import { captureFailure } from '../../shared/periodLock'
import { AppBar, AppScreen, BottomActionBar, LockIcon } from '../../shared/ui/AppShell'
import { Field } from '../../shared/ui/Field'
import { Icon } from '../../shared/ui/Icon'
import { useFlow } from '../../shared/ui/navigation'
import { PaymentFields } from '../../shared/ui/PaymentFields'
import { effectiveChoice, type PaymentChoice } from '../../shared/payment'

export function AdvanceFlow() {
  const org = useOrganization()
  const navigate = useNavigate()
  const advance = useRecordAdvance()

  const [person, setPerson] = useState<CapturePerson | null>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentChoice>(null)
  const [note, setNote] = useState('')
  const [confirmerId, setConfirmerId] = useState<string | null>(null)
  const [secret, setSecret] = useState('')

  const people = useQuery({ queryKey: servicesKeys.people, queryFn: listCapturePeople })
  const methods = useQuery({ queryKey: servicesKeys.paymentMethods, queryFn: listPaymentMethods })

  const amountMinor = wholeUnitsToMinor(amount, org)
  // the organization's own active methods; advances are paid with one method (no Misto, Slice 02 #7)
  const methodList = methods.data ?? []
  const methodRow = methodList.find((m) => m.id === effectiveChoice(method, methodList))
  const hasData = amount !== '' || note.trim() !== ''

  const input: RecordAdvanceInput | null =
    person && amountMinor && amountMinor > 0 && methodRow
      ? { personId: person.id, amountMinor, paymentMethodId: methodRow.id, note: note.trim() || null }
      : null

  const flow = useFlow({ steps: 3, parent: '/', dirty: hasData, reachable: (n) => (n === 2 ? person !== null : input !== null) })
  const step = flow.step

  function leaveNow() {
    advance.reset(); setSecret('')
    flow.leaveTo('/')
  }
  function confirm() {
    if (!input || !confirmerId || !secret) return
    advance.confirm({ input, confirmerId, secret }, { onSuccess: () => { setSecret(''); flow.finish() } })
  }
  function startOver() {
    advance.reset()
    setPerson(null); setAmount(''); setMethod(null); setNote(''); setConfirmerId(null); setSecret('')
    flow.restart()
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
          <p className="note num">Hoje às {formatTime(advance.result.occurred_at, org.timezone)}</p>
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
  ) : step === 3 && input ? (
    <BottomActionBar>
      {advance.status === 'error' && advance.error?.kind === 'network' ? (
        <>
          <button className="btn btn-primary btn-tall" onClick={confirm}>Tentar novamente</button>
          <button className="btn btn-secondary" onClick={flow.exit}>Sair sem guardar</button>
        </>
      ) : (
        <button className="btn btn-primary btn-tall" onClick={confirm} disabled={!confirmerId || !secret || advance.status === 'pending'}>
          {advance.status === 'pending' ? 'A confirmar…' : 'Confirmar adiantamento'}
        </button>
      )}
    </BottomActionBar>
  ) : undefined

  return (
    <AppScreen
      bar={<AppBar title="Adiantamento" leading={step === 1 ? 'close' : 'back'} onLeading={step === 1 ? flow.exit : () => flow.goTo(step - 1)} step={{ current: step, total: 3 }} />}
      actions={footer}>

      {step === 1 && (
        <section className="stack">
          <h2>Adiantamento para quem?</h2>
          <div className="tiles">
            {people.data?.map((p) => (
              <button key={p.id} className="tile" onClick={() => { setPerson(p); flow.goTo(2) }}>
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

      {step === 3 && person && input && (
        <>
          <section className="stack stack-loose">
            <h2>Confirmação necessária</h2>
            <p className="note">Este adiantamento tem de ser confirmado por uma pessoa autorizada.</p>
            <dl className="kv-card">
              <div><dt>Para</dt><dd>{person.display_name}</dd></div>
              <div><dt>Valor</dt><dd className="num">{formatMoney(input.amountMinor, org)}</dd></div>
              <div><dt>Forma de entrega</dt><dd>{methodRow?.label}</dd></div>
              {input.note && <div><dt>Nota</dt><dd>{input.note}</dd></div>}
            </dl>
            <div className="lock-note">
              <LockIcon />
              <span>Fica no histórico com data, hora e quem confirmou. É descontado ao valor a receber no fecho do período.</span>
            </div>
            <ConfirmerPicker confirmerId={confirmerId} onConfirmer={setConfirmerId} secret={secret} onSecret={setSecret}
              error={advance.status === 'error' ? advance.error : null} />
            {advance.status === 'error' && advance.error?.kind === 'network' && (
              <div className="notice notice-error" role="alert">Não foi possível guardar. Os dados continuam aqui.</div>
            )}
            {otherDomainError && <div className="notice notice-error" role="alert">{captureFailure(advance.error, 'Não foi possível guardar este adiantamento.')}</div>}
          </section>
        </>
      )}

      <DiscardSheet open={flow.discard.open} title="Descartar este adiantamento?" onDiscard={flow.discard.confirm} onKeep={flow.discard.cancel} />
    </AppScreen>
  )
}
