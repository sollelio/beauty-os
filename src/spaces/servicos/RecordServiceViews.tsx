// Registar serviço · the flow's presentational parts (learning experience L4a), extracted unchanged from
// RecordServiceFlow so the production flow and the Interactive Guide (L4b) render the same controls. Driven only by
// props: no data hooks, no server, no device storage, no record state. The caller owns the screen frame (AppScreen,
// AppBar), the operational state, what each action does and every notice that depends on the data or the record.
import { useState, type ReactNode } from 'react'
import type { CatalogueService } from '../../modules/catalogue/api'
import type { CapturePerson, PaymentMethod } from '../../modules/services/api'
import { formatMoney, type CurrencySettings } from '../../shared/money'
import { formatTime } from '../../shared/time'
import { AmountField } from '../../shared/ui/AmountField'
import { BottomActionBar } from '../../shared/ui/AppShell'
import { Field } from '../../shared/ui/Field'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { PaymentFields } from '../../shared/ui/PaymentFields'

/** What the screens format money and times with: the organization's settings (synthetic ones in the guide). */
export type FlowFormat = CurrencySettings & { timezone: string }

/** Step 1 · Quem fez o serviço? `children`: the caller's notices, shown above the people. */
export function PersonStep({ people, selectedId, onPick, children }: {
  people: CapturePerson[]; selectedId: string | null; onPick: (p: CapturePerson) => void; children?: ReactNode
}) {
  return (
    <section className="stack">
      <h2>Quem fez o serviço?</h2>
      {children}
      <div className="tiles">
        {people.map((p) => (
          <button key={p.id} className="tile" aria-current={p.id === selectedId || undefined} onClick={() => onPick(p)}>
            <strong>{p.display_name}</strong>
            <span className="support">{p.capabilities.join(' · ')}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** Step 2 · Que serviço? The search and «Ver o catálogo completo» are local to the step.
 *  `frequent`: the person's frequent services to show first (null when there is no such list, e.g. offline);
 *  `draftValue`: the chosen service's edited value (null when it is still the habitual price), shown on its row so a
 *  step back does not look like the edit was lost. */
export function ServicePicker({ person, selectedId, draftValue, catalogue, frequent, loadError, format, onChangePerson, onPick }: {
  person: CapturePerson; selectedId: string | null; draftValue: number | null; catalogue: CatalogueService[]
  frequent: CatalogueService[] | null; loadError: boolean; format: CurrencySettings
  onChangePerson: () => void; onPick: (s: CatalogueService) => void
}) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const q = query.trim().toLowerCase()
  const hasFrequent = (frequent?.length ?? 0) > 0
  const list = q
    ? catalogue.filter((s) => s.name.toLowerCase().includes(q))
    : hasFrequent && !showAll ? frequent ?? [] : catalogue

  return (
    <section className="stack">
      <h2>Que serviço?</h2>
      <div><button className="chip" onClick={onChangePerson} aria-label={`Mudar profissional: ${person.display_name}`}>{person.display_name}<Icon name="edit" size={16} /></button></div>
      <Field label="Procurar serviço" hideLabel leading={<Icon name="search" />}>
        <input type="search" enterKeyHint="search" placeholder="Procurar serviço" value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>
      {!q && hasFrequent && !showAll && <span className="label">Frequentes de {person.display_name}</span>}
      {loadError && <div className="notice notice-error" role="alert">Não foi possível carregar o catálogo.</div>}
      {list.length > 0 && (
        <ListGroup>
          {list.map((s) => {
            const edited = s.id === selectedId && draftValue !== null
            return (
              <ListRow key={s.id} as="button" onClick={() => onPick(s)} current={s.id === selectedId} title={s.name}
                subtitle={edited ? <><strong className="num">{formatMoney(draftValue, format)}</strong><span className="num"> · Habitual: {formatMoney(s.default_price_minor, format)}</span></> : undefined}
                trailing={edited ? undefined : <span className="row-value num muted">{formatMoney(s.default_price_minor, format)}</span>} />
            )
          })}
        </ListGroup>
      )}
      {q && list.length === 0 && <span className="support">Sem resultados para «{query.trim()}».</span>}
      {!q && hasFrequent && !showAll && <button className="link-btn" onClick={() => setShowAll(true)}>Ver o catálogo completo</button>}
    </section>
  )
}

/** Step 3 · Valor e pagamento. `valueMinor`: the value that will be recorded (the typed one, or the habitual);
 *  `sentence`: the Misto sum sentence, when Misto is chosen. */
export function ValuePaymentStep({ defaultPriceMinor, editing, priceDigits, valueMinor, format, onEdit, onReset, onPriceDigits,
  methods, methodsError, choice, onChoice, mixed, onMixed, sentence }: {
  defaultPriceMinor: number; editing: boolean; priceDigits: string; valueMinor: number | null; format: CurrencySettings
  onEdit: () => void; onReset: () => void; onPriceDigits: (digits: string) => void
  methods: readonly PaymentMethod[]; methodsError: boolean; choice: string | null; onChoice: (c: string) => void
  mixed: [string, string]; onMixed: (m: [string, string]) => void; sentence: string | null
}) {
  return (
    <section className="stack stack-loose">
      <h2>Valor e pagamento</h2>
      <div className="stack stack-tight">
        <span className="label">Valor</span>
        {!editing ? (
          <div className="row-between">
            <span className="amount num">{formatMoney(defaultPriceMinor, format)}</span>
            <button className="link-btn" onClick={onEdit}>Editar</button>
          </div>
        ) : (
          <>
            <AmountField label="Valor" hideLabel autoFocus value={priceDigits} onChange={onPriceDigits} symbol={format.currency_symbol}
              placeholder={String(defaultPriceMinor / 10 ** format.currency_exponent)} />
            <div className="row-between">
              <span className="support num">Habitual: {formatMoney(defaultPriceMinor, format)}</span>
              <button className="link-btn" onClick={onReset}>Repor</button>
            </div>
          </>
        )}
        {valueMinor !== null && valueMinor !== defaultPriceMinor && valueMinor > 0 && (
          <span className="support">Valor diferente do habitual. Fica registado no histórico.</span>
        )}
        {valueMinor === 0 && <div className="notice notice-warning">Valor zero. Confirme que este serviço não foi cobrado.</div>}
      </div>

      {methodsError && <div className="notice notice-error" role="alert">Não foi possível carregar as formas de pagamento.</div>}
      <PaymentFields label="Forma de pagamento" methods={methods} choice={choice} onChoice={onChoice}
        mixed={mixed} onMixed={onMixed} sentence={sentence} symbol={format.currency_symbol} />
    </section>
  )
}

/** Step 3's action bar: the summary and «Confirmar serviço». `state`: 'pending' while saving; 'retry' after a failure
 *  that can be retried («Tentar novamente» / «Sair sem guardar»). */
export function ServiceConfirmBar({ serviceName, personName, valueMinor, format, state, canConfirm, onConfirm, onExit }: {
  serviceName: string; personName: string; valueMinor: number | null; format: CurrencySettings
  state: 'ready' | 'pending' | 'retry'; canConfirm: boolean; onConfirm: () => void; onExit: () => void
}) {
  return (
    <BottomActionBar>
      <span className="bar-summary">
        {serviceName} · {personName} · {valueMinor !== null ? formatMoney(valueMinor, format) : '—'}
      </span>
      {state === 'retry' ? (
        <>
          <button className="btn btn-primary btn-tall" onClick={onConfirm} disabled={!canConfirm}>Tentar novamente</button>
          <button className="btn btn-secondary" onClick={onExit}>Sair sem guardar</button>
        </>
      ) : (
        <button className="btn btn-primary btn-tall" onClick={onConfirm} disabled={!canConfirm || state === 'pending'}>
          {state === 'pending' ? 'A guardar…' : 'Confirmar serviço'}
        </button>
      )}
    </BottomActionBar>
  )
}

/** The outcome screens' action bar. */
export function ServiceOutcomeActions({ onAnother, onLeave }: { onAnother: () => void; onLeave: () => void }) {
  return (
    <BottomActionBar>
      <button className="btn btn-primary btn-tall" onClick={onAnother}>Registar outro serviço</button>
      <button className="btn btn-secondary" onClick={onLeave}>Voltar a Hoje</button>
    </BottomActionBar>
  )
}

/** Outcome · registered on the server. */
export function ServiceRecorded({ serviceName, personName, methodLabel, occurredAt, format, onCorrect }: {
  serviceName: string; personName: string; methodLabel: string; occurredAt: string; format: FlowFormat; onCorrect: () => void
}) {
  return (
    <div className="stack center success">
      <span aria-hidden className="success-mark"><Icon name="check" size={34} strokeWidth={2.5} /></span>
      <h2>Serviço registado com sucesso.</h2>
      <p className="note">{serviceName} · {personName} · {methodLabel}</p>
      <p className="note num">Hoje às {formatTime(occurredAt, format.timezone)}</p>
      <button className="link-btn" onClick={onCorrect}>Corrigir este registo</button>
    </div>
  )
}

/** Outcome · saved on this phone (offline), to be sent when there is a connection — never shown as registered. */
export function ServiceSavedOnDevice({ serviceName, personName, methodLabel, valueMinor, occurredAt, format }: {
  serviceName: string; personName: string; methodLabel: string; valueMinor: number; occurredAt: string; format: FlowFormat
}) {
  return (
    <div className="stack center success" data-testid="saved-on-device">
      <span aria-hidden className="success-mark success-mark-local"><Icon name="clock" size={34} strokeWidth={2.5} /></span>
      <h2>Guardado neste telemóvel</h2>
      <p className="support">Será enviado quando houver ligação.</p>
      <p className="note">{serviceName} · {personName} · {methodLabel}</p>
      <p className="note num">{formatMoney(valueMinor, format)} · às {formatTime(occurredAt, format.timezone)}</p>
    </div>
  )
}
