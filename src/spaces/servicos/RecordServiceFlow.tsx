// Registar serviço (Slice 01 §4): Quem fez o serviço? → Que serviço? → Valor e pagamento → Sucesso.
// Steps are history entries and a typed value is never dropped silently (useFlow, the mobile back contract).
// Offline (ADR-0010, Offline 4): the same steps from the salon data kept on this device (at most 48 hours old); the
// service is saved on this phone and sent when there is a connection — never shown as registered before that.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import type { CatalogueService } from '../../modules/catalogue/api'
import { listFrequentServices, servicesKeys, type CapturePerson, type RecordServiceInput } from '../../modules/services/api'
import { useCaptureData, type CaptureBlock } from '../../modules/services/useCaptureData'
import type { QueueFailure } from '../../modules/services/useRecordService'
import { checkPayment, choiceLabel, effectiveChoice, MIXED, paymentParts, type PaymentChoice, type PaymentMode } from '../../shared/payment'
import { useRecordService } from '../../modules/services/useRecordService'
import { formatMoney, wholeUnitsToMinor } from '../../shared/money'
import { formatTime } from '../../shared/time'
import { captureFailure } from '../../shared/periodLock'
import { AmountField } from '../../shared/ui/AmountField'
import { AppBar, AppScreen, BottomActionBar } from '../../shared/ui/AppShell'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { Field } from '../../shared/ui/Field'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
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

  const data = useCaptureData()

  const typed = editing ? wholeUnitsToMinor(priceDigits, org) : null
  const valueMinor = service ? (typed ?? service.default_price_minor) : null
  // the organization's own active methods (codes and labels are tenant data); the first is preselected
  const methodList = data.paymentMethods
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

  if (flow.completed && person && service && record.queued) {
    return (
      <AppScreen actions={
        <BottomActionBar>
          <button className="btn btn-primary btn-tall" onClick={startOver}>Registar outro serviço</button>
          <button className="btn btn-secondary" onClick={leave}>Voltar a Hoje</button>
        </BottomActionBar>
      }>
        <div className="stack center success" data-testid="saved-on-device">
          <span aria-hidden className="success-mark success-mark-local"><Icon name="clock" size={34} strokeWidth={2.5} /></span>
          <h2>Guardado neste telemóvel</h2>
          <p className="support">Será enviado quando houver ligação.</p>
          <p className="note">{service.name} · {person.display_name} · {choiceLabel(choice, methodList)}</p>
          <p className="note num">{formatMoney(valueMinor ?? 0, org)} · às {formatTime(record.queued.occurredAt, org.timezone)}</p>
        </div>
      </AppScreen>
    )
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
        <div className="stack center success">
          <span aria-hidden className="success-mark"><Icon name="check" size={34} strokeWidth={2.5} /></span>
          <h2>Serviço registado com sucesso.</h2>
          <p className="note">{service.name} · {person.display_name} · {methodText}</p>
          <p className="note num">Hoje às {formatTime(record.result.occurred_at, org.timezone)}</p>
          <button className="link-btn" onClick={() => navigate(`/registos/anular/service/${record.result!.record_id}`)}>Corrigir este registo</button>
        </div>
      </AppScreen>
    )
  }

  const footer = step === 3 && person && service && (
    <BottomActionBar>
      <span className="bar-summary">
        {service.name} · {person.display_name} · {valueMinor !== null ? formatMoney(valueMinor, org) : '—'}
      </span>
      {record.status === 'error' && !(record.queueFailure === 'missing' || record.queueFailure === 'stale') ? (
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
          {data.blocked && <div className="notice notice-neutral" role="status" data-testid="offline-blocked">{BLOCKED[data.blocked]}</div>}
          {data.errors.people && <div className="notice notice-error" role="alert">Não foi possível carregar a equipa.</div>}
          <div className="tiles">
            {data.people.map((p) => (
              <button key={p.id} className="tile" aria-current={p.id === person?.id || undefined}
                onClick={() => { if (p.id !== person?.id) { setPerson(p); setService(null) } flow.goTo(2) }}>
                <strong>{p.display_name}</strong>
                <span className="support">{p.capabilities.join(' · ')}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && person && (
        // Re-entering the chosen service keeps its draft (an edited value survives back); another service starts from its own price.
        <ServiceStep person={person} selectedId={service?.id ?? null} catalogue={data.services} catalogueError={data.errors.services} offline={data.offline}
          draftValue={typed !== null && service && typed !== service.default_price_minor ? typed : null} onChangePerson={() => flow.goTo(1)}
          onPick={(s) => { if (s.id !== service?.id) { setService(s); setEditing(false); setPriceDigits('') } flow.goTo(3) }} />
      )}

      {step === 3 && person && service && (
        <>
          <section className="stack stack-loose">
            <h2>Valor e pagamento</h2>
            <div className="stack stack-tight">
              <span className="label">Valor</span>
              {!editing ? (
                <div className="row-between">
                  <span className="amount num">{formatMoney(service.default_price_minor, org)}</span>
                  <button className="link-btn" onClick={() => { setEditing(true); setPriceDigits('') }}>Editar</button>
                </div>
              ) : (
                <>
                  <AmountField label="Valor" hideLabel autoFocus value={priceDigits} onChange={setPriceDigits} symbol={org.currency_symbol}
                    placeholder={String(service.default_price_minor / 10 ** org.currency_exponent)} />
                  <div className="row-between">
                    <span className="support num">Habitual: {formatMoney(service.default_price_minor, org)}</span>
                    <button className="link-btn" onClick={() => { setEditing(false); setPriceDigits('') }}>Repor</button>
                  </div>
                </>
              )}
              {valueMinor !== null && valueMinor !== service.default_price_minor && valueMinor > 0 && (
                <span className="support">Valor diferente do habitual. Fica registado no histórico.</span>
              )}
              {valueMinor === 0 && <div className="notice notice-warning">Valor zero. Confirme que este serviço não foi cobrado.</div>}
            </div>

            {data.errors.paymentMethods && <div className="notice notice-error" role="alert">Não foi possível carregar as formas de pagamento.</div>}
            <PaymentFields label="Forma de pagamento" methods={methodList} choice={choice} onChoice={setMethod}
              mixed={mixed} onMixed={setMixed} sentence={choice === MIXED ? check.sentence : null} symbol={org.currency_symbol} />
          </section>

          {record.status === 'error' && record.queueFailure && (
            <div className="notice notice-error" role="alert">{QUEUE_FAILURE[record.queueFailure]}</div>
          )}
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

const BLOCKED: Record<CaptureBlock, string> = {
  missing: 'Sem ligação. Para registar serviços sem ligação, este telemóvel precisa de ter aberto o Beauty OS com ligação nas últimas 48 horas.',
  stale: 'Sem ligação. Os dados do salão neste telemóvel têm mais de 48 horas: é preciso ligação para os atualizar antes de registar.',
  unavailable: 'Sem ligação. Este telemóvel não consegue guardar registos sem ligação.',
}
const QUEUE_FAILURE: Record<QueueFailure, string> = {
  storage: 'Não foi possível guardar neste telemóvel. Os dados continuam aqui.',
  missing: BLOCKED.missing,
  stale: BLOCKED.stale,
}

// `draftValue`: the chosen service's edited value (null when it is still the habitual price), shown on its row so a step
// back does not look like the edit was lost. Offline there is no "frequentes" list: the full catalogue kept on the device.
function ServiceStep({ person, selectedId, draftValue, catalogue, catalogueError, offline, onChangePerson, onPick }: {
  person: CapturePerson; selectedId: string | null; draftValue: number | null; catalogue: CatalogueService[]; catalogueError: boolean
  offline: boolean; onChangePerson: () => void; onPick: (s: CatalogueService) => void
}) {
  const org = useOrganization()
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const frequent = useQuery({ queryKey: servicesKeys.frequent(person.id), queryFn: () => listFrequentServices(person.id), enabled: !offline })

  const q = query.trim().toLowerCase()
  const hasFrequent = !offline && (frequent.data?.length ?? 0) > 0
  const list = q
    ? catalogue.filter((s) => s.name.toLowerCase().includes(q))
    : hasFrequent && !showAll ? frequent.data ?? [] : catalogue

  return (
    <section className="stack">
      <h2>Que serviço?</h2>
      <div><button className="chip" onClick={onChangePerson} aria-label={`Mudar profissional: ${person.display_name}`}>{person.display_name}<Icon name="edit" size={16} /></button></div>
      <Field label="Procurar serviço" hideLabel leading={<Icon name="search" />}>
        <input type="search" enterKeyHint="search" placeholder="Procurar serviço" value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>
      {!q && hasFrequent && !showAll && <span className="label">Frequentes de {person.display_name}</span>}
      {(catalogueError || (!offline && frequent.isError)) && <div className="notice notice-error" role="alert">Não foi possível carregar o catálogo.</div>}
      {list.length > 0 && (
        <ListGroup>
          {list.map((s) => {
            const edited = s.id === selectedId && draftValue !== null
            return (
              <ListRow key={s.id} as="button" onClick={() => onPick(s)} current={s.id === selectedId} title={s.name}
                subtitle={edited ? <><strong className="num">{formatMoney(draftValue, org)}</strong><span className="num"> · Habitual: {formatMoney(s.default_price_minor, org)}</span></> : undefined}
                trailing={edited ? undefined : <span className="row-value num muted">{formatMoney(s.default_price_minor, org)}</span>} />
            )
          })}
        </ListGroup>
      )}
      {q && list.length === 0 && <span className="support">Sem resultados para «{query.trim()}».</span>}
      {!q && hasFrequent && !showAll && <button className="link-btn" onClick={() => setShowAll(true)}>Ver o catálogo completo</button>}
    </section>
  )
}
