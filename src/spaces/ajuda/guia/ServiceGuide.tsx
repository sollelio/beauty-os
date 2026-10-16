// Interactive Guide «Como registar um serviço» (learning experience L4b; Guide V4 as corrected in L0). The real
// Registar serviço screens (RecordServiceViews, L4a) driven by synthetic data in this component's memory, under a
// persistent «Demonstração · nada fica registado» band, with one highlighted control per step and a compact coach.
// Nothing is recorded, sent or stored: no data hook, no server, no device storage, no capture, PIN or sync handler —
// confirming only moves the demonstration to a simulated success screen.
//
// Navigation is the app's own capture-flow contract (useFlow): every guide step is a history entry, so Android/browser
// back returns one step; the intro shares the first step's entry, so back from there returns to the Help topic that
// opened the guide. Leaving or finishing unwinds to that topic (or replaces with it after a direct link). There is
// never a «Descartar?» question: nothing can be lost.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Navigate, useLocation, useParams } from 'react-router'
import type { CapturePerson } from '../../../modules/services/api'
import type { CatalogueService } from '../../../modules/catalogue/api'
import { wholeUnitsToMinor } from '../../../shared/money'
import { useConnectivity } from '../../../shared/offline/connectivity'
import { checkPayment, choiceLabel, effectiveChoice, MIXED, type PaymentChoice } from '../../../shared/payment'
import { AppBar, AppScreen, BottomActionBar } from '../../../shared/ui/AppShell'
import { Icon } from '../../../shared/ui/Icon'
import { useFlow } from '../../../shared/ui/navigation'
import { PersonStep, ServiceConfirmBar, ServiceOutcomeActions, ServicePicker, ServiceRecorded, ServiceSavedOnDevice, ValuePaymentStep } from '../../servicos/RecordServiceViews'
import { METHODS, PEOPLE, TARGET_METHOD, TARGET_PERSON, useGuideData, type GuideData } from './data'
import './guide.css'

const STEPS = 6
const DONE = STEPS + 1                                   // the closing screen: one more history entry after step 6

/** The coach's instruction per step (Guide V4, L0-corrected). The title names the highlighted control. */
const COACH: Record<number, { title: string; text: string }> = {
  1: { title: 'Toque em Joana.', text: 'Quem fez o serviço é sempre o primeiro passo. Não precisa de PIN nem de conta.' },
  2: { title: 'Toque em Corte.', text: 'Os serviços frequentes desta pessoa aparecem primeiro; o catálogo completo está abaixo.' },
  3: { title: 'Toque em Editar.', text: 'O valor habitual já vem preenchido; só muda quando o cliente pagou outro valor.' },
  4: { title: 'Toque em Transferência.', text: 'Misto (só com duas formas de pagamento) divide o valor e só confirma quando a soma bate certo.' },
  5: { title: 'Toque em Confirmar serviço.', text: 'Com ligação, fica registado na hora. Sem ligação, fica neste telemóvel e segue quando o Beauty OS abrir com ligação.' },
  6: { title: 'Pronto.', text: 'Fica serviço, pessoa e forma de pagamento. Nunca ganhos nem valores pessoais: o telemóvel é partilhado.' },
}

/** «Corrigir este registo» on the simulated success: corrections are not part of this guide (in the app it opens the
 *  cancellation, with a reason and a PIN), so it only says so — nothing is opened or changed. */
const CORRECTION_NOTE = 'Na app, «Corrigir este registo» abre a anulação deste registo, com motivo e PIN. Não faz parte desta demonstração: veja o tema «Anular um registo errado» na Ajuda.'

/** The one highlighted control per step, found in the rendered screen (6: none). */
const TARGET: Record<number, (root: HTMLElement) => Element | undefined> = {
  1: (r) => [...r.querySelectorAll('.tile')].find((b) => b.querySelector('strong')?.textContent === TARGET_PERSON.display_name),
  2: (r) => [...r.querySelectorAll('button.row')].find((b) => b.querySelector('.row-title')?.textContent === 'Corte'),
  3: (r) => [...r.querySelectorAll('button.link-btn')].find((b) => b.textContent === 'Editar'),
  4: (r) => [...r.querySelectorAll('button.seg')].find((b) => b.textContent === TARGET_METHOD.label),
  5: (r) => [...r.querySelectorAll('.bottom-bar button.btn-primary')].find((b) => b.textContent === 'Confirmar serviço'),
}

/** Screen of the simulated flow per step: 1 people, 2 services, 3 value and payment (steps 3–5), 4 success. */
const screenOf = (step: number) => (step <= 2 ? step : step <= 5 ? 3 : 4)

/** The Help topic this guide belongs to (topics.ts marks it `tutorial: true`). */
export const GUIDE_TOPIC = 'registar-servico'

export function ServiceGuidePage() {
  const { tema } = useParams()
  const data = useGuideData()
  // only on its own topic, and only in a currency with example prices; otherwise back to the topic
  if (tema !== GUIDE_TOPIC || !data) return <Navigate to={tema ? `/ajuda/${tema}` : '/ajuda'} replace />
  return <ServiceGuide topicPath={`/ajuda/${GUIDE_TOPIC}`} data={data} />
}

function ServiceGuide({ topicPath, data }: { topicPath: string; data: GuideData }) {
  const { format, frequent, catalogue } = data
  const connectivity = useConnectivity()
  const coachId = useId()
  const root = useRef<HTMLDivElement>(null)

  // the demonstration's own state: memory only, gone when the guide closes
  const [started, setStarted] = useState(false)
  const [person, setPerson] = useState<CapturePerson | null>(null)
  const [service, setService] = useState<CatalogueService | null>(null)
  const [editing, setEditing] = useState(false)
  const [priceDigits, setPriceDigits] = useState('')
  const [method, setMethod] = useState<PaymentChoice>(null)
  const [mixed, setMixed] = useState<[string, string]>(['', ''])
  const [outcome, setOutcome] = useState<{ occurredAt: string; offline: boolean } | null>(null)
  // «Corrigir este registo» tapped on the simulated success: the note belongs to that history entry only
  const entry = useLocation().key
  const [correctionNoteAt, setCorrectionNoteAt] = useState<string | null>(null)

  // value and payment exactly as the real flow derives them (the app's pure helpers)
  const typed = editing ? wholeUnitsToMinor(priceDigits, format) : null
  const valueMinor = service ? (typed ?? service.default_price_minor) : null
  const choice = effectiveChoice(method, METHODS)
  const mixedMinor: [number | null, number | null] = [wholeUnitsToMinor(mixed[0], format), wholeUnitsToMinor(mixed[1], format)]
  const check = checkPayment(valueMinor, choice === MIXED ? 'mixed' : 'single', mixedMinor, format)
  const canConfirm = valueMinor !== null && check.valid

  const flow = useFlow({
    steps: DONE, parent: topicPath, dirty: false,                     // nothing to lose: never «Descartar?»
    reachable: (n) => started && person !== null && (n === 2 || (service !== null && (n <= 5 || canConfirm))),
  })
  const step = flow.step
  const go = flow.goTo

  function reset() {
    setPerson(null); setService(null); setEditing(false); setPriceDigits(''); setMethod(null); setMixed(['', '']); setOutcome(null)
  }
  // «Recomeçar» / «Ver outra vez»: back to step 1's entry first, then a fresh demonstration there
  const restartPending = useRef(false)
  function restart() {
    if (step === 1) reset()
    else { restartPending.current = true; go(1) }
  }
  // back from «Transferência» (4) to «Editar» (3) closes the value field again, so its instruction applies (Guide V4)
  const previous = useRef(step)
  useEffect(() => {
    if (step === 1 && restartPending.current) { restartPending.current = false; reset() }
    if (previous.current === 4 && step === 3) { setEditing(false); setPriceDigits('') }
    previous.current = step
  }, [step])

  const exit = () => flow.finishTo(topicPath)
  const pickPerson = (p: CapturePerson) => { if (p.id !== person?.id) { setPerson(p); setService(null) } go(2) }
  const pickService = (s: CatalogueService) => { if (s.id !== service?.id) { setService(s); setEditing(false); setPriceDigits('') } go(3) }
  const chooseMethod = (c: string) => { setMethod(c); if (step === 4) go(5) }
  const confirm = () => {
    if (!canConfirm) return
    setOutcome({ occurredAt: new Date().toISOString(), offline: connectivity === 'offline' })
    go(6)
  }
  // «Seguinte»: does the highlighted action for the person
  function next() {
    if (step === 1) pickPerson(person ?? TARGET_PERSON)
    else if (step === 2) pickService(service ?? frequent[0]!)
    else if (step === 3) go(4)
    else if (step === 4) chooseMethod(TARGET_METHOD.id)
    else if (step === 5) confirm()
    else go(DONE)
  }

  useHighlight(root, started && step <= 5 ? TARGET[step] : undefined, coachId, step)

  if (!started && step === 1) {
    return (
      <div className="guide" ref={root}>
        <AppScreen bar={<div className="guide-top"><Band /></div>} actions={
          <BottomActionBar>
            <button className="btn btn-primary btn-tall" onClick={() => setStarted(true)}>Começar demonstração</button>
            <button className="btn btn-secondary" onClick={exit}>Agora não</button>
          </BottomActionBar>
        }>
          <div className="stack guide-intro">
            <span className="guide-mark" aria-hidden="true"><Icon name="help" size={28} /></span>
            <div className="stack stack-tight">
              <span className="label">Cerca de 1 minuto · 6 passos</span>
              <h2>Como registar um serviço</h2>
              <p className="note">Vai usar o fluxo real com dados de exemplo. Toque nos elementos destacados para avançar. <strong>Nada do que fizer aqui fica registado.</strong></p>
            </div>
            <div className="panel guide-keys">
              <p><span className="guide-key" aria-hidden="true"><Icon name="close" size={14} /></span><span className="guide-key" aria-hidden="true"><Icon name="back" size={14} /></span>
                <span>Fechar (×) e Voltar (←), no topo, são da própria app e fazem o mesmo que na app: × fecha o registo (e a demonstração), ← volta um ecrã.</span></p>
              <p><span className="guide-key guide-key-coach" aria-hidden="true" />
                <span>O cartão em baixo é da demonstração: Anterior e Seguinte mudam de passo sem tocar na app; Sair termina.</span></p>
            </div>
            <p className="support">Não precisa de ligação nem de PIN. Pode sair a qualquer momento.</p>
          </div>
        </AppScreen>
      </div>
    )
  }

  if (step === DONE) {
    return (
      <div className="guide" ref={root}>
        <AppScreen bar={<div className="guide-top"><Band done /></div>} actions={
          <BottomActionBar>
            <button className="btn btn-primary btn-tall" onClick={exit}>Fechar</button>
            <button className="btn btn-secondary" onClick={restart}>Ver outra vez</button>
          </BottomActionBar>
        }>
          <div className="stack center success">
            <span aria-hidden className="success-mark"><Icon name="check" size={34} strokeWidth={2.5} /></span>
            <h2>Demonstração terminada</h2>
            <p className="note">Nada ficou registado. Quando houver um serviço de verdade, toque em <strong>Registar serviço</strong> no Hoje.</p>
          </div>
        </AppScreen>
      </div>
    )
  }

  const screen = screenOf(step)
  const coach = COACH[step]!
  const bar = screen === 4 ? null : (
    <AppBar title="Registar serviço" leading={screen === 1 ? 'close' : 'back'} step={{ current: screen, total: 3 }}
      onLeading={screen === 1 ? exit : () => go(screen === 2 ? 1 : 2)} />
  )
  const appActions = screen === 3 && person && service
    ? <ServiceConfirmBar serviceName={service.name} personName={person.display_name} valueMinor={valueMinor} format={format}
        state="ready" canConfirm={canConfirm} onConfirm={confirm} onExit={exit} />
    // «Voltar a Hoje» leaves the flow in the app; here it leaves the demonstration, back to the Help topic that opened it
    : screen === 4 ? <ServiceOutcomeActions onAnother={restart} onLeave={exit} /> : null
  const result = outcome ?? { occurredAt: new Date().toISOString(), offline: connectivity === 'offline' }

  return (
    <div className="guide" ref={root}>
      <AppScreen bar={<div className="guide-top"><Band />{bar}</div>} actions={
        <div className="guide-dock">
          {appActions}
          <Coach step={step} title={coach.title} text={coach.text} textId={coachId} onRestart={restart} onExit={exit}
            onPrev={() => go(step - 1)} onNext={next} nextDisabled={step === 5 && !canConfirm}
            note={screen === 4 && correctionNoteAt === entry ? CORRECTION_NOTE : null} />
        </div>
      }>
        {screen === 1 && <PersonStep people={PEOPLE} selectedId={person?.id ?? null} onPick={pickPerson} />}

        {screen === 2 && person && (
          <ServicePicker person={person} selectedId={service?.id ?? null} catalogue={catalogue} frequent={frequent} loadError={false}
            draftValue={typed !== null && service && typed !== service.default_price_minor ? typed : null} format={format}
            onChangePerson={() => go(1)} onPick={pickService} />
        )}

        {screen === 3 && person && service && (
          <ValuePaymentStep defaultPriceMinor={service.default_price_minor} editing={editing} priceDigits={priceDigits} valueMinor={valueMinor}
            format={format} onEdit={() => { setEditing(true); setPriceDigits(''); if (step === 3) go(4) }}
            onReset={() => { setEditing(false); setPriceDigits('') }} onPriceDigits={setPriceDigits}
            methods={METHODS} methodsError={false} choice={choice} onChoice={chooseMethod}
            mixed={mixed} onMixed={setMixed} sentence={choice === MIXED ? check.sentence : null} />
        )}

        {screen === 4 && person && service && (result.offline
          ? <ServiceSavedOnDevice serviceName={service.name} personName={person.display_name} methodLabel={choiceLabel(choice, METHODS)}
              valueMinor={valueMinor ?? 0} occurredAt={result.occurredAt} format={format} />
          : <ServiceRecorded serviceName={service.name} personName={person.display_name} methodLabel={choiceLabel(choice, METHODS)}
              occurredAt={result.occurredAt} format={format} onCorrect={() => setCorrectionNoteAt(entry)} />)}
      </AppScreen>
    </div>
  )
}

/** Always on top: this is a demonstration and nothing is (or was) recorded. */
function Band({ done = false }: { done?: boolean }) {
  return (
    <div className="guide-band" role="status">
      <Icon name="help" size={16} />Demonstração <span>· {done ? 'nada ficou registado' : 'nada fica registado'}</span>
    </div>
  )
}

function Coach({ step, title, text, textId, onRestart, onExit, onPrev, onNext, nextDisabled, note }: {
  step: number; title: string; text: string; textId: string; onRestart: () => void; onExit: () => void
  onPrev: () => void; onNext: () => void; nextDisabled: boolean; note: string | null
}) {
  return (
    <section className="guide-coach" aria-label="Demonstração: instruções">
      <div className="guide-coach-head">
        <span className="guide-dots" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, i) => <span key={i} className={i < step ? 'on' : undefined} />)}
        </span>
        <span className="guide-coach-step">Passo {step} de {STEPS}</span>
        <CoachButton quiet onClick={onRestart}>Recomeçar</CoachButton>
        <CoachButton quiet onClick={onExit}>Sair</CoachButton>
      </div>
      {/* announced on every step: the instruction never depends on the highlight's colour or motion */}
      <p className="guide-coach-text" id={textId} aria-live="polite"><strong>{title}</strong> {text}</p>
      {note && <p className="guide-coach-note" role="status">{note}</p>}
      <div className="guide-coach-actions">
        <CoachButton onClick={onPrev} disabled={step === 1}><Icon name="back" size={18} />Anterior</CoachButton>
        <CoachButton onClick={onNext} disabled={nextDisabled}>{step === STEPS ? 'Terminar' : 'Seguinte'}<Icon name="chevronRight" size={18} /></CoachButton>
      </div>
    </section>
  )
}

function CoachButton({ quiet, disabled, onClick, children }: { quiet?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={quiet ? 'guide-coach-btn guide-coach-btn-quiet' : 'guide-coach-btn'} disabled={disabled} onClick={onClick}>{children}</button>
}

/** Marks the step's one control in the real screen (`data-guide-target`, drawn by guide.css) and links it to the
 *  instruction (aria-describedby). Re-applied when the screen re-renders that control; nothing in the screen moves. */
function useHighlight(root: RefObject<HTMLDivElement | null>, find: ((root: HTMLElement) => Element | undefined) | undefined, coachId: string, step: number) {
  useLayoutEffect(() => {
    const el = root.current
    if (!el || !find) return
    let current: Element | undefined
    const clear = () => { current?.removeAttribute('data-guide-target'); current?.removeAttribute('aria-describedby') }
    const apply = () => {
      const target = find(el)
      if (target === current) return
      clear()
      current = target
      current?.setAttribute('data-guide-target', '')
      current?.setAttribute('aria-describedby', coachId)
    }
    apply()
    ;(current as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' })
    const observer = new MutationObserver(apply)
    observer.observe(el, { childList: true, subtree: true })
    return () => { observer.disconnect(); clear() }
  }, [root, find, coachId, step])
}
