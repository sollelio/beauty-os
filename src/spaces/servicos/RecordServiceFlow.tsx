// Registar serviço (Slice 01 §4): Quem fez o serviço? → Que serviço? → Valor e pagamento → Sucesso.
// Steps are history entries and a typed value is never dropped silently (useFlow, the mobile back contract).
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { listServices, catalogueKeys, type CatalogueService } from '../../modules/catalogue/api'
import {
  listCapturePeople, listFrequentServices, listPaymentMethods, servicesKeys,
  type CapturePerson, type RecordServiceInput,
} from '../../modules/services/api'
import { checkPayment, choiceLabel, effectiveChoice, MIXED, paymentParts, type PaymentChoice, type PaymentMode } from '../../shared/payment'
import { useRecordService } from '../../modules/services/useRecordService'
import { formatMoney, wholeUnitsToMinor } from '../../shared/money'
import { formatTime } from '../../shared/time'
import { captureFailure } from '../../shared/periodLock'
import { AppBar, AppScreen, BottomActionBar } from '../../shared/ui/AppShell'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { useFlow } from '../../shared/ui/navigation'
import { PaymentFields } from '../../shared/ui/PaymentFields'

export function RecordServiceFlow() {
  const org = useOrganization()
  const navigate = useNavigate()
  const record = useRecordService()

  const [person, setPerson] = useState<CapturePerson | null>(null)
  const [service, setService] = useState<CatalogueService | null>(null)
  const [editing, setEditing] = useState(false)
  const [priceDigits, setPriceDigits] = useState('')
  const [method, setMethod] = useState<PaymentChoice>(null)
  const [mixed, setMixed] = useState<[string, string]>(['', ''])

  const people = useQuery({ queryKey: servicesKeys.people, queryFn: listCapturePeople })
  const methods = useQuery({ queryKey: servicesKeys.paymentMethods, queryFn: listPaymentMethods })

  const typed = editing ? wholeUnitsToMinor(priceDigits, org) : null
  const valueMinor = service ? (typed ?? service.default_price_minor) : null
  // the organization's own active methods (codes and labels are tenant data); the first is preselected
  const methodList = methods.data ?? []
  const choice = effectiveChoice(method, methodList)
  const mode: PaymentMode = choice === MIXED ? 'mixed' : 'single'
  const mixedMinor: [number | null, number | null] = [wholeUnitsToMinor(mixed[0], org), wholeUnitsToMinor(mixed[1], org)]
  const check = checkPayment(valueMinor, mode, mixedMinor, org)

  const payments = paymentParts(choice, methodList, valueMinor, mixedMinor)
  const input: RecordServiceInput | null = person && service && valueMinor !== null && check.valid && payments
    ? { personId: person.id, serviceId: service.id, valueMinor, payments } : null

  // a typed value or mixed amounts are worth a "discard?"; picking a person or a service alone is not
  const dirty = (editing && priceDigits !== '') || mixed[0] !== '' || mixed[1] !== ''
  const flow = useFlow({ steps: 3, parent: '/', dirty, reachable: (n) => (n === 2 ? person !== null : person !== null && service !== null) })
  const step = flow.step

  function confirm() {
    if (!input) return
    record.submit(input, { onSuccess: () => flow.finish() })
  }

  function startOver() {
    record.reset()
    setPerson(null); setService(null); setEditing(false); setPriceDigits('')
    setMethod(null); setMixed(['', ''])
    flow.restart()
  }

  function leave() {
    record.reset()
    flow.leaveTo('/')
  }

  if (flow.completed && person && service && record.result) {
    const methodText = choiceLabel(choice, methodList)
    return (
      <AppScreen actions={
        <BottomActionBar>
          <button className="btn btn-primary btn-tall" onClick={startOver}>Registar outro serviço</button>
          <button className="btn btn-secondary" onClick={leave}>Voltar a Hoje</button>
        </BottomActionBar>
      }>
        <div className="stack center" style={{ marginTop: '3rem', gap: '0.75rem' }}>
          <span aria-hidden className="success-mark">✓</span>
          <h2>Serviço registado com sucesso.</h2>
          <p className="muted" style={{ margin: 0 }}>{service.name} · {person.display_name} · {methodText}</p>
          <p className="muted num" style={{ margin: 0 }}>Hoje às {formatTime(record.result.occurred_at, org.timezone)}</p>
          <button className="link-btn" onClick={() => navigate(`/registos/anular/service/${record.result!.record_id}`)}>Corrigir este registo</button>
        </div>
      </AppScreen>
    )
  }

  const footer = step === 3 && person && service && (
    <BottomActionBar>
      <span className="muted num" style={{ textAlign: 'center' }}>
        {service.name} · {person.display_name} · {valueMinor !== null ? formatMoney(valueMinor, org) : '—'}
      </span>
      {record.status === 'error' ? (
        <>
          <button className="btn btn-primary btn-tall" onClick={confirm} disabled={!input}>Tentar novamente</button>
          <button className="btn btn-secondary" onClick={flow.exit}>Sair sem guardar</button>
        </>
      ) : (
        <button className="btn btn-primary btn-tall" onClick={confirm} disabled={!input || record.status === 'pending'}>
          {record.status === 'pending' ? 'A guardar…' : 'Confirmar serviço'}
        </button>
      )}
    </BottomActionBar>
  )
  return (
    <AppScreen
      bar={<AppBar title="Registar serviço" leading={step === 1 ? 'close' : 'back'} onLeading={step === 1 ? flow.exit : () => flow.goTo(step - 1)} step={{ current: step, total: 3 }} />}
      actions={footer || undefined}>

      {step === 1 && (
        <section className="stack">
          <h2>Quem fez o serviço?</h2>
          {people.isError && <div className="notice notice-error" role="alert">Não foi possível carregar a equipa.</div>}
          <div className="tiles">
            {people.data?.map((p) => (
              <button key={p.id} className="tile" aria-current={p.id === person?.id || undefined}
                onClick={() => { if (p.id !== person?.id) { setPerson(p); setService(null) } flow.goTo(2) }}>
                <strong>{p.display_name}</strong>
                <span className="muted" style={{ fontSize: '0.875rem' }}>{p.capabilities.join(' · ')}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && person && (
        // Re-entering the chosen service keeps its draft (an edited value survives back); another service starts from its own price.
        <ServiceStep person={person} selectedId={service?.id ?? null}
          draftValue={typed !== null && service && typed !== service.default_price_minor ? typed : null} onChangePerson={() => flow.goTo(1)}
          onPick={(s) => { if (s.id !== service?.id) { setService(s); setEditing(false); setPriceDigits('') } flow.goTo(3) }} />
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

            {methods.isError && <div className="notice notice-error" role="alert">Não foi possível carregar as formas de pagamento.</div>}
            <PaymentFields label="Forma de pagamento" methods={methodList} choice={choice} onChoice={setMethod}
              mixed={mixed} onMixed={setMixed} sentence={choice === MIXED ? check.sentence : null} symbol={org.currency_symbol} />
          </section>

          {record.status === 'error' && record.error && (
            <div className="notice notice-error" role="alert">
              {record.error.kind === 'network'
                ? 'Não foi possível guardar. Os dados continuam aqui.'
                : captureFailure(record.error, 'Não foi possível guardar este registo.')}
            </div>
          )}
        </>
      )}
      <DiscardSheet open={flow.discard.open} title="Descartar este serviço?" onDiscard={flow.discard.confirm} onKeep={flow.discard.cancel} />
    </AppScreen>
  )
}

// `draftValue`: the chosen service's edited value (null when it is still the habitual price), shown on its row so a step
// back does not look like the edit was lost.
function ServiceStep({ person, selectedId, draftValue, onChangePerson, onPick }: {
  person: CapturePerson; selectedId: string | null; draftValue: number | null; onChangePerson: () => void; onPick: (s: CatalogueService) => void
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
          <button key={s.id} className="pick" aria-current={s.id === selectedId || undefined} onClick={() => onPick(s)}
            style={s.id === selectedId && draftValue !== null ? { paddingTop: '0.5rem', paddingBottom: '0.5rem' } : undefined}>
            {s.id === selectedId && draftValue !== null ? (
              <span>
                <span style={{ display: 'block', fontWeight: 600 }}>{s.name}</span>
                <span className="num" style={{ display: 'block', fontSize: '0.9375rem' }}>
                  <strong>{formatMoney(draftValue, org)}</strong><span className="muted"> · Habitual: {formatMoney(s.default_price_minor, org)}</span>
                </span>
              </span>
            ) : (
              <>
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <span className="num muted">{formatMoney(s.default_price_minor, org)}</span>
              </>
            )}
          </button>
        ))}
        {q && list.length === 0 && <span className="muted">Sem resultados para «{query.trim()}».</span>}
      </div>
      {!q && hasFrequent && !showAll && <button className="link-btn" onClick={() => setShowAll(true)}>Ver o catálogo completo</button>}
    </section>
  )
}
