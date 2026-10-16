// Registar serviço (Slice 01 §4): Quem fez o serviço? → Que serviço? → Valor e pagamento → Sucesso.
// Steps are history entries and a typed value is never dropped silently (useFlow, the mobile back contract).
// Offline (ADR-0010, Offline 4): the same steps from the salon data kept on this device (at most 48 hours old); the
// service is saved on this phone and sent when there is a connection — never shown as registered before that.
// The screens' markup lives in RecordServiceViews (props only, shared with the Interactive Guide, L4a); this component
// keeps every hook, the operational state, the record and data notices, and what each action does.
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
import { wholeUnitsToMinor } from '../../shared/money'
import { captureFailure } from '../../shared/periodLock'
import { AppBar, AppScreen } from '../../shared/ui/AppShell'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { useFlow } from '../../shared/ui/navigation'
import { PersonStep, ServiceConfirmBar, ServiceOutcomeActions, ServicePicker, ServiceRecorded, ServiceSavedOnDevice, ValuePaymentStep } from './RecordServiceViews'

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
      <AppScreen actions={<ServiceOutcomeActions onAnother={startOver} onLeave={leave} />}>
        <ServiceSavedOnDevice serviceName={service.name} personName={person.display_name} methodLabel={choiceLabel(choice, methodList)}
          valueMinor={valueMinor ?? 0} occurredAt={record.queued.occurredAt} format={org} />
      </AppScreen>
    )
  }

  if (flow.completed && person && service && record.result) {
    const recordId = record.result.record_id
    return (
      <AppScreen actions={<ServiceOutcomeActions onAnother={startOver} onLeave={leave} />}>
        <ServiceRecorded serviceName={service.name} personName={person.display_name} methodLabel={choiceLabel(choice, methodList)}
          occurredAt={record.result.occurred_at} format={org} onCorrect={() => navigate(`/registos/anular/service/${recordId}`)} />
      </AppScreen>
    )
  }

  // a failure that can be retried here; a missing or stale offline snapshot cannot (its notice says why)
  const retry = record.status === 'error' && !(record.queueFailure === 'missing' || record.queueFailure === 'stale')
  const footer = step === 3 && person && service && (
    <ServiceConfirmBar serviceName={service.name} personName={person.display_name} valueMinor={valueMinor} format={org}
      state={retry ? 'retry' : record.status === 'pending' ? 'pending' : 'ready'} canConfirm={!!input} onConfirm={confirm} onExit={flow.exit} />
  )
  return (
    <AppScreen
      bar={<AppBar title="Registar serviço" leading={step === 1 ? 'close' : 'back'} onLeading={step === 1 ? flow.exit : () => flow.goTo(step - 1)} step={{ current: step, total: 3 }} />}
      actions={footer || undefined}>

      {step === 1 && (
        <PersonStep people={data.people} selectedId={person?.id ?? null}
          onPick={(p) => { if (p.id !== person?.id) { setPerson(p); setService(null) } flow.goTo(2) }}>
          {data.blocked && <div className="notice notice-neutral" role="status" data-testid="offline-blocked">{BLOCKED[data.blocked]}</div>}
          {data.errors.people && <div className="notice notice-error" role="alert">Não foi possível carregar a equipa.</div>}
        </PersonStep>
      )}

      {step === 2 && person && (
        // Re-entering the chosen service keeps its draft (an edited value survives back); another service starts from its own price.
        <ServiceStep person={person} selectedId={service?.id ?? null} catalogue={data.services} catalogueError={data.errors.services} offline={data.offline}
          draftValue={typed !== null && service && typed !== service.default_price_minor ? typed : null} onChangePerson={() => flow.goTo(1)}
          onPick={(s) => { if (s.id !== service?.id) { setService(s); setEditing(false); setPriceDigits('') } flow.goTo(3) }} />
      )}

      {step === 3 && person && service && (
        <>
          <ValuePaymentStep defaultPriceMinor={service.default_price_minor} editing={editing} priceDigits={priceDigits} valueMinor={valueMinor}
            format={org} onEdit={() => { setEditing(true); setPriceDigits('') }} onReset={() => { setEditing(false); setPriceDigits('') }}
            onPriceDigits={setPriceDigits} methods={methodList} methodsError={data.errors.paymentMethods} choice={choice} onChoice={setMethod}
            mixed={mixed} onMixed={setMixed} sentence={choice === MIXED ? check.sentence : null} />

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

// The person's frequent services (online only) around the ServicePicker. Offline there is no "frequentes" list: the full
// catalogue kept on the device.
function ServiceStep({ person, selectedId, draftValue, catalogue, catalogueError, offline, onChangePerson, onPick }: {
  person: CapturePerson; selectedId: string | null; draftValue: number | null; catalogue: CatalogueService[]; catalogueError: boolean
  offline: boolean; onChangePerson: () => void; onPick: (s: CatalogueService) => void
}) {
  const org = useOrganization()
  const frequent = useQuery({ queryKey: servicesKeys.frequent(person.id), queryFn: () => listFrequentServices(person.id), enabled: !offline })
  return (
    <ServicePicker person={person} selectedId={selectedId} draftValue={draftValue} catalogue={catalogue}
      frequent={offline ? null : frequent.data ?? null} loadError={catalogueError || (!offline && frequent.isError)} format={org}
      onChangePerson={onChangePerson} onPick={onPick} />
  )
}
