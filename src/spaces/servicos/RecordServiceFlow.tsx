// Registar serviço (Slice 01 §4): Quem fez o serviço? → Que serviço? → Valor e pagamento → Sucesso.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { listServices, catalogueKeys, type CatalogueService } from '../../modules/catalogue/api'
import {
  listCapturePeople, listFrequentServices, listPaymentMethods, servicesKeys,
  type CapturePerson, type PaymentPart, type RecordServiceInput,
} from '../../modules/services/api'
import { checkPayment, type PaymentMode } from '../../shared/payment'
import { useRecordService } from '../../modules/services/useRecordService'
import { formatMoney, wholeUnitsToMinor } from '../../shared/money'
import { formatTime } from '../../shared/time'
import { captureFailure } from '../../shared/periodLock'

type Step = 1 | 2 | 3 | 'done'
type Method = 'numerario' | 'transferencia' | 'mixed'

export function RecordServiceFlow() {
  const org = useOrganization()
  const navigate = useNavigate()
  const record = useRecordService()

  const [step, setStep] = useState<Step>(1)
  const [person, setPerson] = useState<CapturePerson | null>(null)
  const [service, setService] = useState<CatalogueService | null>(null)
  const [editing, setEditing] = useState(false)
  const [priceDigits, setPriceDigits] = useState('')
  const [method, setMethod] = useState<Method>('numerario')
  const [mixed, setMixed] = useState<[string, string]>(['', ''])

  const people = useQuery({ queryKey: servicesKeys.people, queryFn: listCapturePeople })
  const methods = useQuery({ queryKey: servicesKeys.paymentMethods, queryFn: listPaymentMethods })

  const typed = editing ? wholeUnitsToMinor(priceDigits, org) : null
  const valueMinor = service ? (typed ?? service.default_price_minor) : null
  const mode: PaymentMode = method === 'mixed' ? 'mixed' : 'single'
  const mixedMinor: [number | null, number | null] = [wholeUnitsToMinor(mixed[0], org), wholeUnitsToMinor(mixed[1], org)]
  const check = checkPayment(valueMinor, mode, mixedMinor, org)

  const methodId = (code: string) => methods.data?.find((m) => m.code === code)?.id
  const input: RecordServiceInput | null = useMemo(() => {
    if (!person || !service || valueMinor === null || !check.valid) return null
    let payments: PaymentPart[]
    if (method === 'mixed') {
      const cash = methodId('numerario'), transfer = methodId('transferencia')
      if (!cash || !transfer) return null
      payments = [{ method_id: cash, amount_minor: mixedMinor[0] ?? 0 }, { method_id: transfer, amount_minor: mixedMinor[1] ?? 0 }]
    } else {
      const id = methodId(method)
      if (!id) return null
      payments = [{ method_id: id, amount_minor: valueMinor }]
    }
    return { personId: person.id, serviceId: service.id, valueMinor, payments }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person, service, valueMinor, check.valid, method, mixed[0], mixed[1], methods.data])

  function confirm() {
    if (!input) return
    record.submit(input, { onSuccess: () => setStep('done') })
  }

  function startOver() {
    record.reset()
    setStep(1); setPerson(null); setService(null); setEditing(false); setPriceDigits('')
    setMethod('numerario'); setMixed(['', ''])
  }

  function leave() {
    record.reset()
    navigate('/')
  }

  if (step === 'done' && person && service && record.result) {
    const methodText = method === 'mixed' ? 'Misto' : methods.data?.find((m) => m.code === method)?.label
    return (
      <main className="app-main">
        <div className="stack center" style={{ marginTop: '3rem', gap: '0.75rem' }}>
          <span aria-hidden className="success-mark">✓</span>
          <h2>Serviço registado com sucesso.</h2>
          <p className="muted" style={{ margin: 0 }}>{service.name} · {person.display_name} · {methodText}</p>
          <p className="muted num" style={{ margin: 0 }}>Hoje às {formatTime(record.result.occurred_at, org.timezone)}</p>
          <button className="link-btn" onClick={() => navigate(`/registos/anular/service/${record.result!.record_id}`)}>Corrigir este registo</button>
        </div>
        <div className="footer">
          <button className="btn btn-primary btn-tall" onClick={startOver}>Registar outro serviço</button>
          <button className="btn btn-secondary" onClick={leave}>Voltar a Hoje</button>
        </div>
      </main>
    )
  }

  const stepNo = step === 'done' ? 3 : step
  return (
    <main className="app-main">
      <header className="flow-header">
        <div className="flow-header-row">
          {stepNo === 1
            ? <button className="icon-btn" aria-label="Fechar" onClick={leave}>×</button>
            : <button className="icon-btn" aria-label="Voltar" onClick={() => setStep((stepNo - 1) as Step)}>←</button>}
          <span className="muted" style={{ fontWeight: 600 }}>Registar serviço</span>
          <span className="label num" style={{ width: '2.75rem', textAlign: 'right' }}>{stepNo} / 3</span>
        </div>
        <div className="progress" aria-hidden>{[1, 2, 3].map((n) => <span key={n} className={n <= stepNo ? 'on' : ''} />)}</div>
      </header>

      {step === 1 && (
        <section className="stack">
          <h2>Quem fez o serviço?</h2>
          {people.isError && <div className="notice notice-error" role="alert">Não foi possível carregar a equipa.</div>}
          <div className="tiles">
            {people.data?.map((p) => (
              <button key={p.id} className="tile" onClick={() => { setPerson(p); setService(null); setStep(2) }}>
                <strong>{p.display_name}</strong>
                <span className="muted" style={{ fontSize: '0.875rem' }}>{p.capabilities.join(' · ')}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && person && (
        <ServiceStep person={person} onChangePerson={() => setStep(1)}
          onPick={(s) => { setService(s); setEditing(false); setPriceDigits(''); setStep(3) }} />
      )}

      {step === 3 && person && service && (
        <>
          <section className="stack" style={{ gap: '1rem' }}>
            <h2>Valor e pagamento</h2>
            <div className="stack" style={{ gap: '0.25rem' }}>
              <span className="label">Valor</span>
              {!editing ? (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span className="amount num">{formatMoney(service.default_price_minor, org)}</span>
                  <button className="link-btn" onClick={() => { setEditing(true); setPriceDigits('') }}>Editar</button>
                </div>
              ) : (
                <>
                  <label className="field">
                    <input inputMode="numeric" autoFocus aria-label="Valor" value={priceDigits}
                      placeholder={String(service.default_price_minor / 10 ** org.currency_exponent)}
                      onChange={(e) => setPriceDigits(e.target.value.replace(/\D/g, '').slice(0, 9))} />
                    <span className="muted">{org.currency_symbol}</span>
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="muted num">Habitual: {formatMoney(service.default_price_minor, org)}</span>
                    <button className="link-btn" onClick={() => { setEditing(false); setPriceDigits('') }}>Repor</button>
                  </div>
                </>
              )}
              {valueMinor !== null && valueMinor !== service.default_price_minor && valueMinor > 0 && (
                <span className="muted" style={{ fontSize: '0.9rem' }}>Valor diferente do habitual. Fica registado no histórico.</span>
              )}
              {valueMinor === 0 && <div className="notice notice-warning">Valor zero. Confirme que este serviço não foi cobrado.</div>}
            </div>

            <div className="stack">
              <span className="label">Forma de pagamento</span>
              <div className="segmented" role="group" aria-label="Forma de pagamento">
                {([['numerario', 'Numerário'], ['transferencia', 'Transferência'], ['mixed', 'Misto']] as const).map(([code, label]) => (
                  <button key={code} className="seg" aria-pressed={method === code} onClick={() => setMethod(code)}>{label}</button>
                ))}
              </div>
              {method === 'mixed' && (
                <div className="stack">
                  {(['Numerário', 'Transferência'] as const).map((label, i) => (
                    <label key={label} className="field">
                      <span className="muted" style={{ width: '7.5rem' }}>{label}</span>
                      <input inputMode="numeric" aria-label={label} value={mixed[i]}
                        onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 9); setMixed(i === 0 ? [v, mixed[1]] : [mixed[0], v]) }} />
                      <span className="muted">{org.currency_symbol}</span>
                    </label>
                  ))}
                  {check.sentence && <span className="muted num" data-testid="mixed-sentence">{check.sentence}</span>}
                </div>
              )}
            </div>
          </section>

          {record.status === 'error' && record.error && (
            <div className="notice notice-error" role="alert">
              {record.error.kind === 'network'
                ? 'Não foi possível guardar. Os dados continuam aqui.'
                : captureFailure(record.error, 'Não foi possível guardar este registo.')}
            </div>
          )}

          <div className="footer">
            <span className="muted num" style={{ textAlign: 'center' }}>
              {service.name} · {person.display_name} · {valueMinor !== null ? formatMoney(valueMinor, org) : '—'}
            </span>
            {record.status === 'error' ? (
              <>
                <button className="btn btn-primary btn-tall" onClick={confirm} disabled={!input}>Tentar novamente</button>
                <button className="btn btn-secondary" onClick={leave}>Sair sem guardar</button>
              </>
            ) : (
              <button className="btn btn-primary btn-tall" onClick={confirm} disabled={!input || record.status === 'pending'}>
                {record.status === 'pending' ? 'A guardar…' : 'Confirmar serviço'}
              </button>
            )}
          </div>
        </>
      )}
    </main>
  )
}

function ServiceStep({ person, onChangePerson, onPick }: {
  person: CapturePerson; onChangePerson: () => void; onPick: (s: CatalogueService) => void
}) {
  const org = useOrganization()
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const catalogue = useQuery({ queryKey: catalogueKeys.services, queryFn: listServices })
  const frequent = useQuery({ queryKey: servicesKeys.frequent(person.id), queryFn: () => listFrequentServices(person.id) })

  const q = query.trim().toLowerCase()
  const hasFrequent = (frequent.data?.length ?? 0) > 0
  const list = q
    ? (catalogue.data ?? []).filter((s) => s.name.toLowerCase().includes(q))
    : hasFrequent && !showAll ? frequent.data ?? [] : catalogue.data ?? []

  return (
    <section className="stack">
      <h2>Que serviço?</h2>
      <div><button className="chip" onClick={onChangePerson} aria-label={`Mudar profissional: ${person.display_name}`}>{person.display_name} ✎</button></div>
      <label className="field">
        <input type="search" aria-label="Procurar serviço" placeholder="Procurar serviço" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {!q && hasFrequent && !showAll && <span className="label">Frequentes de {person.display_name}</span>}
      {(catalogue.isError || frequent.isError) && <div className="notice notice-error" role="alert">Não foi possível carregar o catálogo.</div>}
      <div className="stack">
        {list.map((s) => (
          <button key={s.id} className="pick" onClick={() => onPick(s)}>
            <span style={{ fontWeight: 600 }}>{s.name}</span>
            <span className="num muted">{formatMoney(s.default_price_minor, org)}</span>
          </button>
        ))}
        {q && list.length === 0 && <span className="muted">Sem resultados para «{query.trim()}».</span>}
      </div>
      {!q && hasFrequent && !showAll && <button className="link-btn" onClick={() => setShowAll(true)}>Ver o catálogo completo</button>}
    </section>
  )
}
