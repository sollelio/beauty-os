// Ajuda (learning experience L2, docs/design/learning-experience.md · Help Center V6): Ajuda → Tema → Passo a passo.
// Public on an enrolled device (under DeviceGate, no PIN), the same for every salon, written help only. It reads
// nothing but its own bundled content (topics.ts): no server, no device storage, no organization data — so it works
// offline once the app shell is cached. Back follows the app's contract (useAppBack): in history when opened inside
// the app; a direct link replaces with the parent (topic → Ajuda → Hoje). The search lives in the URL (?q=), so back
// from a topic returns to the same results.
import { Link, useParams, useSearchParams } from 'react-router'
import { AppBar, AppScreen } from '../../shared/ui/AppShell'
import { Field } from '../../shared/ui/Field'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow, RowIcon } from '../../shared/ui/ListRow'
import { useAppBack } from '../../shared/ui/navigation'
import { EmptyState } from '../../shared/ui/states'
import { findTopic, GROUP_LABEL, searchTopics, TOPICS, type HelpGroup, type HelpTopic } from './topics'
import './ajuda.css'

const tone = (g: HelpGroup) => (g === 'private' ? 'quiet' : g === 'offline' ? 'warning' : 'accent')

function TopicRow({ topic }: { topic: HelpTopic }) {
  return (
    <ListRow as="link" to={`/ajuda/${topic.id}`} leading={<RowIcon name={topic.icon} tone={tone(topic.group)} />}
      title={topic.title} subtitle={topic.summary} chevron />
  )
}

function TopicGroup({ group }: { group: HelpGroup }) {
  const id = `ajuda-${group}`
  return (
    <section className="stack" aria-labelledby={id}>
      <span className={group === 'private' ? 'label group-label' : 'label'} id={id}>
        {group === 'private' && <Icon name="lock" size={14} />}{GROUP_LABEL[group]}
      </span>
      <ListGroup>{TOPICS.filter((t) => t.group === group).map((t) => <TopicRow key={t.id} topic={t} />)}</ListGroup>
      {group === 'private' && <p className="support">A ajuda explica como funciona, sem dados reais. Os valores só aparecem na app, depois do PIN.</p>}
    </section>
  )
}

export function HelpHome() {
  const back = useAppBack('/')
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const searching = query.trim() !== ''
  const results = searching ? searchTopics(query) : []
  const setQuery = (q: string) => setParams(q ? { q } : {}, { replace: true })

  return (
    <AppScreen bar={<AppBar title="Ajuda" leading="back" onLeading={back} />}>
      <Field label="Procurar na ajuda" hideLabel leading={<Icon name="search" />}>
        <input type="search" enterKeyHint="search" autoComplete="off" placeholder="Procurar: serviço, stock, PIN…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>

      {searching && results.length > 0 && (
        <section className="stack" aria-label="Resultados">
          <span className="label" role="status">{results.length === 1 ? '1 resultado' : `${results.length} resultados`}</span>
          <ListGroup>{results.map((t) => <TopicRow key={t.id} topic={t} />)}</ListGroup>
        </section>
      )}
      {searching && results.length === 0 && (
        <EmptyState icon="search" title={`Sem resultados para «${query.trim()}»`}
          action={<button type="button" className="link-btn" onClick={() => setQuery('')}>Ver todos os temas</button>}>
          Tente outra palavra, como «registar», «PIN» ou «lista de compra».
        </EmptyState>
      )}

      {!searching && (
        <>
          <TopicGroup group="daily" />
          <TopicGroup group="offline" />
          <TopicGroup group="private" />
          <p className="support">Esta ajuda fica guardada neste telemóvel e funciona sem ligação.</p>
        </>
      )}
    </AppScreen>
  )
}

function TopicMissing({ onBack }: { onBack: () => void }) {
  return (
    <AppScreen bar={<AppBar title="Ajuda" leading="back" onLeading={onBack} />}>
      <EmptyState icon="help" title="Este tema não existe" action={<Link className="link-btn" to="/ajuda" replace>Ver todos os temas</Link>}>
        Pode ter mudado de nome. Os temas disponíveis estão na Ajuda.
      </EmptyState>
    </AppScreen>
  )
}

export function HelpTopicPage() {
  const back = useAppBack('/ajuda')
  const topic = findTopic(useParams().tema)
  if (!topic) return <TopicMissing onBack={back} />

  return (
    <AppScreen bar={<AppBar title="Ajuda" leading="back" onLeading={back} />}>
      <header className="stack stack-tight">
        <span className="label">{GROUP_LABEL[topic.group]}</span>
        <h2>{topic.title}</h2>
        <p className="note">{topic.summary}</p>
      </header>
      {topic.group === 'private' && (
        <div className="notice notice-neutral help-note"><Icon name="lock" size={18} />
          <span>Na app, este passo pede o PIN de uma pessoa com permissão. A ajuda explica só como funciona.</span>
        </div>
      )}
      {/* The topic's content types — only those usable today. Animation (L3) and the interactive tutorial (L4) join
          this list as rows when they exist; nothing is shown for what is not available yet. */}
      <ListGroup aria-label="Conteúdos">
        <ListRow as="link" to={`/ajuda/${topic.id}/passos`} leading={<RowIcon name="list" tone="quiet" />} chevron
          title="Passo a passo" subtitle={`${topic.steps.length} passos · funciona sem ligação`} />
      </ListGroup>
    </AppScreen>
  )
}

export function HelpStepsPage() {
  const { tema } = useParams()
  const back = useAppBack(`/ajuda/${tema ?? ''}`)
  const topic = findTopic(tema)
  if (!topic) return <TopicMissing onBack={back} />

  return (
    <AppScreen bar={<AppBar title={topic.title} leading="back" onLeading={back} />}>
      <header className="stack stack-tight">
        <span className="label">Passo a passo</span>
        <h2>{topic.title}</h2>
      </header>
      {/* role="list": list-style none would otherwise drop the list semantics in some screen readers */}
      <ol className="help-steps" role="list">
        {topic.steps.map((s, i) => <li key={i}><span className="help-step-n" aria-hidden="true">{i + 1}</span><span>{s}</span></li>)}
      </ol>
      {topic.tip && <div className="notice notice-neutral">{topic.tip}</div>}
      <p className="support">A ajuda é igual para todos os salões e não mostra dados reais: os nomes, serviços e valores do seu salão são os que vê na app.</p>
    </AppScreen>
  )
}
