// Situação do profissional / A minha situação (Slice 04). Every figure is read from the database read model; this
// screen only arranges and words them. Manager view (B4) shows attributions; the self view (B3) never does.
// On the mobile shell (UX slice 7): the private bar — for a manager ← back to Equipa inside the private area, for the
// person's own view × as the explicit exit (it is the root) — whole rows, both sheets as history entries, history rows
// grouped by day; a correction opens inside the private area (/privado/anular/…) and comes back here.
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyState, ErrorState, Skeleton } from '../../shared/ui/states'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { clearPrivateData } from '../../modules/org/privateContext'
import { AppScreen } from '../../shared/ui/AppShell'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack, useSheet } from '../../shared/ui/navigation'
import { SegmentedControl } from '../../shared/ui/SegmentedControl'
import { PrivateBar } from './PrivateBar'
import {
  getHistory, getSituation, listPeriods, situationKeys,
  type HistoryKind, type HistoryRow, type PeriodState, type Situation,
} from '../../modules/team/situation'
import { toAppError } from '../../shared/errors'
import { formatAmount, formatMoney } from '../../shared/money'
import { dayKey, formatDayShort, formatTime } from '../../shared/time'

const STATE_LABEL: Record<PeriodState, string> = {
  aberto: 'aberto', pronto_para_pagamento: 'pronto para pagamento', em_pagamento: 'em pagamento', fechado: 'fechado',
}
const pct = (n: number | null) => `${String(Number(n)).replace('.', ',')}%`
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const FILTERS: { kind: HistoryKind | null; label: string }[] = [
  { kind: null, label: 'Tudo' }, { kind: 'service', label: 'Serviços' }, { kind: 'advance', label: 'Adiantamentos' },
  { kind: 'payment', label: 'Pagamentos' }, { kind: 'contribution', label: 'Contribuições' },
]

export function SituationPage() {
  const { personId = '' } = useParams()
  const org = useOrganization()
  const qc = useQueryClient()
  const [sp] = useSearchParams()
  const back = useAppBack('/privado/equipa')
  const [periodId, setPeriodId] = useState<string | null>(sp.get('p'))
  const [tab, setTab] = useState<'resumo' | 'hist'>('resumo')
  const [filter, setFilter] = useState<HistoryKind | null>(null)
  const sheets = useSheet<'explain' | 'period'>()
  const sheet = sheets.current

  const situation = useQuery({ queryKey: situationKeys.situation(personId, periodId), queryFn: () => getSituation(personId, periodId) })
  const history = useQuery({ queryKey: situationKeys.history(personId, periodId, filter), queryFn: () => getHistory(personId, periodId, filter), enabled: tab === 'hist',
    placeholderData: keepPreviousData })                      // a filter change keeps the current rows visible while the next load
  const periods = useQuery({ queryKey: situationKeys.periods(personId), queryFn: () => listPeriods(personId), enabled: sheet === 'period' })

  // The server ended the context (expiry, revocation, another holder): drop everything sensitive.
  const lost = [situation.error, history.error, periods.error].some((e) => e && toAppError(e).code === 'VERIFICATION_REQUIRED')
  useEffect(() => { if (lost) clearPrivateData(qc) }, [lost, qc])

  // The bar is known before the situation is: the root (own view) or a manager's screen inside the private area.
  const own = situation.data ? situation.data.view !== 'manager' : false
  const bar = <PrivateBar title={own ? 'A minha situação' : 'Situação'} root={own} onBack={back} />
  if (situation.isPending) return <AppScreen bar={bar}><Skeleton rows={4} headline /></AppScreen>
  if (situation.isError) {
    return (
      <AppScreen bar={bar}>
        <ErrorState onRetry={() => situation.refetch()} action={<button type="button" className="link-btn" onClick={back}>Voltar</button>}>Não foi possível mostrar esta situação.</ErrorState>
      </AppScreen>
    )
  }

  const s = situation.data
  const goHist = (k: HistoryKind | null) => { setFilter(k); setTab('hist') }

  return (
    <AppScreen bar={bar}>
      <section className="stack">
        <div className="row-between">
          <span className="row-between" style={{ justifyContent: 'flex-start' }}>
            <span className="avatar" aria-hidden>{s.person.display_name.slice(0, 1)}</span>
            <span className="stack stack-tight">
              <h1>{s.person.display_name}</h1>
              {s.person.capabilities.length > 0 && <span className="support">{s.person.capabilities.join(' · ')}</span>}
            </span>
          </span>
          <button className="chip chip-outline" aria-label={`Período: ${s.period.label}`} onClick={() => sheets.open('period')}>{s.period.label}<Icon name="chevronDown" size={18} /></button>
        </div>
        <SegmentedControl label="Secção" hideLabel value={tab} onChange={(t) => (t === 'hist' ? goHist(null) : setTab('resumo'))}
          options={[{ id: 'resumo', label: 'Resumo' }, { id: 'hist', label: 'Histórico' }]} />
      </section>

      {tab === 'resumo'
        ? <Summary s={s} onExplain={() => sheets.open('explain')} onHistory={goHist} />
        : <HistoryView s={s} filter={filter} onFilter={setFilter} rows={history.data?.rows} total={history.data?.total_count}
            loading={history.isPending} error={history.isError && !lost} stale={history.isPlaceholderData} onRetry={() => history.refetch()} />}

      {sheet === 'explain' && <ExplainSheet s={s} onClose={sheets.close} />}
      {sheet === 'period' && (
        <BottomSheet labelledBy="pe-title" onDismiss={sheets.close}>
          <div className="row-between">
            <h2 id="pe-title" className="sheet-title">Período</h2>
            <button className="icon-btn" aria-label="Fechar" onClick={sheets.close}><Icon name="close" /></button>
          </div>
          {periods.isPending && <Skeleton rows={3} />}
          {periods.isError && <ErrorState onRetry={() => periods.refetch()}>Não foi possível carregar os períodos.</ErrorState>}
          {periods.data && (
            <ListGroup>
              {periods.data.map((p) => {
                const on = p.id === s.period.id
                return (
                  <ListRow key={p.id} as="button" current={on} onClick={() => { setPeriodId(p.id); sheets.close() }} title={p.label}
                    subtitle={STATE_LABEL[p.state]}
                    trailing={on ? <span className="row-accent row-chevron"><Icon name="check" /></span>
                      : p.payments_total_minor > 0 ? <span className="row-value num muted">{formatMoney(p.payments_total_minor, org)}</span> : undefined} />
                )
              })}
            </ListGroup>
          )}
          <p className="note support">Períodos fechados só se alteram por reabertura autorizada no Fecho.</p>
        </BottomSheet>
      )}
    </AppScreen>
  )
}

function Summary({ s, onExplain, onHistory }: { s: Situation; onExplain: () => void; onHistory: (k: HistoryKind) => void }) {
  const org = useOrganization()
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const manager = s.view === 'manager'
  const determinate = s.rule.kind !== 'none' && s.earned_minor !== null      // standing, or contextual once decided (Slice 06)
  const rule = s.rule.kind === 'none' ? null : s.rule
  const state = STATE_LABEL[s.period.state]
  const derivation = `ganho ${g(s.earned_minor ?? 0)} − adiantamentos ${g(s.advances.total_minor)} − pagamentos ${g(s.payments.total_minor)}`
  const excess = (s.excess_minor ?? 0) > 0
  const last = s.payments.last
  const paymentsSub = s.payments.count === 0 ? 'Nenhum neste período'
    : [count(s.payments.count, 'pagamento registado', 'pagamentos registados'),
       ...(last ? [formatDayShort(last.paid_at, org.timezone), last.method_label.toLocaleLowerCase('pt-PT')] : []),
       ...(manager && last?.confirmed_by ? [`confirmado por ${last.confirmed_by}`] : [])].join(' · ')

  return (
    <>
      {determinate ? (
        <button className="money-headline row-tappable" onClick={onExplain}>
          <span className="label">Falta receber · {state}</span>
          <span className="amount" data-testid="remaining">{m(s.remaining_minor ?? 0)}</span>
          <span className="num support" data-testid="derivation">{excess ? `${derivation} = ${g(s.difference_minor ?? 0)}` : `= ${derivation}`}</span>
          <span className="money-link">Como se chega a este valor?<Icon name="chevronRight" size={18} /></span>
        </button>
      ) : (
        <button className="money-headline row-tappable" onClick={onExplain}>
          <span className="label">Falta receber · {state}</span>
          <span className="amount muted" data-testid="remaining">—</span>
          <span className="support">Por determinar: a regra deste período ainda não foi definida.</span>
          <span className="money-link">Porque não há valor?<Icon name="chevronRight" size={18} /></span>
        </button>
      )}
      {determinate && excess && (
        <div className="notice notice-warning" role="status">Recebeu mais do que o ganho até agora ({m(s.excess_minor ?? 0)}). O que acontece a essa diferença é decidido pela gestão.</div>
      )}
      {!determinate && (
        <div className="notice notice-warning" role="status">Até a regra ser definida não há valor ganho nem valor a receber. A produção e os adiantamentos ficam registados e entram no cálculo nessa altura.</div>
      )}

      <ListGroup aria-label="Composição">
        <Row title="Produção" sub={count(s.production.count, 'serviço registado', 'serviços registados')} value={m(s.production.total_minor)} onOpen={() => onHistory('service')} />
        {determinate && rule ? (
          <Row title="Regra deste período" value={pct(rule.percent)} onOpen={onExplain}
            sub={`${pct(rule.percent)} para ${manager ? s.person.display_name : 'si'} · ${pct(rule.salon_percent)} para o salão${manager ? ` · definida em ${formatDayShort(rule.set_at, org.timezone)}` : ''}`} />
        ) : (
          <Row title="Regra deste período" sub="Ainda não definida" value="Por determinar" tone="warning" />
        )}
        <Row title="Ganho" sub={determinate && rule ? `${pct(rule.percent)} × ${g(s.production.total_minor)}` : 'Depende da regra'}
          value={determinate ? m(s.earned_minor ?? 0) : '—'} tone={determinate ? undefined : 'muted'} />
        <Row title="Adiantamentos"
          sub={s.advances.count === 0 ? 'Nenhum neste período' : `${count(s.advances.count, 'adiantamento', 'adiantamentos')}${determinate ? '' : ' · descontado quando a regra for definida'}`}
          value={s.advances.count === 0 ? '—' : determinate ? m(-s.advances.total_minor) : m(s.advances.total_minor)}
          tone={s.advances.count === 0 ? 'muted' : undefined} onOpen={() => onHistory('advance')} />
        <Row title="Pagamentos" sub={paymentsSub} value={s.payments.count === 0 ? '—' : m(-s.payments.total_minor)}
          tone={s.payments.count === 0 ? 'muted' : undefined} onOpen={() => onHistory('payment')} />
      </ListGroup>

      {s.contributions.count > 0 && (
        <section className="stack">
          <span className="label">À parte</span>
          <ListGroup>
            <ListRow as="button" onClick={() => onHistory('contribution')} title="Contribuições em compras" chevron
              subtitle={`${count(s.contributions.count, 'compra', 'compras')} neste período`} trailing={<span className="row-value num">{m(s.contributions.total_minor)}</span>} />
          </ListGroup>
          <span className="support">Registado à parte. Não é descontado nem somado ao valor a receber.</span>
        </section>
      )}

      <p className="note support">
        {!manager ? 'Vê apenas os seus registos. Se algum valor não bater certo, fale com a gestão.'
          : `${determinate && rule?.set_by ? `Regra definida por ${rule.set_by} em ${formatDayShort(rule.set_at, org.timezone)}. ` : determinate ? '' : 'A regra deste período ainda não foi definida. '}Correcções a registos ficam no histórico com quem as fez.`}
      </p>
    </>
  )
}

function Row({ title, sub, value, onOpen, tone }: { title: string; sub: string; value: string; onOpen?: () => void; tone?: 'muted' | 'warning' }) {
  const slots = { title, subtitle: <span className="num">{sub}</span>, trailing: <span className={`row-value num${tone ? ` tone-${tone}` : ''}`}>{value}</span> }
  return onOpen ? <ListRow as="button" onClick={onOpen} chevron {...slots} /> : <ListRow {...slots} />
}

function ExplainSheet({ s, onClose }: { s: Situation; onClose: () => void }) {
  const org = useOrganization()
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const manager = s.view === 'manager'
  const rule = s.rule.kind !== 'none' && s.earned_minor !== null ? s.rule : null
  const determinate = rule !== null
  const excess = (s.excess_minor ?? 0) > 0
  const services = `${count(s.production.count, 'serviço registado', 'serviços registados')} = ${m(s.production.total_minor)}`
  const steps: [string, string][] = determinate ? [
    ['Produção do período', services],
    ['Regra deste período', `${pct(rule.percent)} para ${manager ? s.person.display_name : 'si'} · ${pct(rule.salon_percent)} para o salão${manager && rule.set_by ? ` · definida por ${rule.set_by} em ${formatDayShort(rule.set_at, org.timezone)}` : ''}`],
    ['Ganho', `${pct(rule.percent)} × ${g(s.production.total_minor)} = ${m(s.earned_minor ?? 0)}`],
    ['Adiantamentos recebidos', s.advances.count === 0 ? 'Nenhum neste período' : `${count(s.advances.count, 'adiantamento', 'adiantamentos')} = ${m(s.advances.total_minor)}`],
    ['Pagamentos feitos', s.payments.count === 0 ? 'Nenhum neste período' : `${count(s.payments.count, 'pagamento', 'pagamentos')} = ${m(s.payments.total_minor)}`],
    ['Falta receber', `${g(s.earned_minor ?? 0)} − ${g(s.advances.total_minor)} − ${g(s.payments.total_minor)} = ${excess
      ? `${m(s.difference_minor ?? 0)} → mostra 0; a diferença é decidida pela gestão` : m(s.remaining_minor ?? 0)}`],
  ] : [
    ['Produção do período', services],
    ['Regra deste período', 'Ainda não definida.'],
    ['Ganho e valor a receber', 'Só existem depois de a regra ser definida.'],
    ['Adiantamentos recebidos', `${m(s.advances.total_minor)} — ficam registados e são descontados quando a regra for definida.`],
  ]
  const title = !determinate ? 'Porque não há valor a receber?' : excess ? `Porque mostra ${m(0)}?` : `Como se chega a ${m(s.remaining_minor ?? 0)}?`
  return (
    <BottomSheet labelledBy="ex-title" onDismiss={onClose}>
      <div className="row-between">
        <h2 id="ex-title" className="sheet-title">{title}</h2>
        <button className="icon-btn" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
      </div>
      <ol className="explain" data-testid="explanation">
        {steps.map(([h, b]) => <li key={h}><strong>{h}</strong><br /><span className="muted num">{b}</span></li>)}
      </ol>
      {determinate && s.contributions.count > 0 && (
        <p className="note support">Contribuições em compras ({m(s.contributions.total_minor)}) ficam à parte e não entram neste cálculo.</p>
      )}
    </BottomSheet>
  )
}

function HistoryView({ s, filter, onFilter, rows, total, loading, error, stale, onRetry }: {
  s: Situation; filter: HistoryKind | null; onFilter: (k: HistoryKind | null) => void; rows?: HistoryRow[]; total?: number
  loading: boolean; error: boolean; stale: boolean; onRetry: () => void
}) {
  const org = useOrganization()
  const navigate = useNavigate()
  const m = (n: number) => formatMoney(n, org)
  const manager = s.view === 'manager'
  const sumLine = filter === 'service' ? `Produção ${m(s.production.total_minor)}`
    : filter === 'advance' ? `Total ${m(-s.advances.total_minor)}`
    : filter === 'payment' ? `Total ${m(-s.payments.total_minor)}`
    : filter === 'contribution' ? `Total ${m(s.contributions.total_minor)} · à parte` : ''
  const empty = filter === 'payment' ? 'Nenhum pagamento registado neste período. Aparece aqui assim que for registado.'
    : filter === 'advance' ? 'Nenhum adiantamento neste período.'
    : filter === 'contribution' ? 'Nenhuma contribuição em compras neste período.' : 'Sem registos neste período.'
  const days: { key: string; rows: HistoryRow[] }[] = []
  for (const r of rows ?? []) {
    const k = dayKey(r.occurred_at, org.timezone)
    if (days.at(-1)?.key !== k) days.push({ key: k, rows: [] })
    days.at(-1)!.rows.push(r)
  }
  const sub = (r: HistoryRow) => {
    const method = r.method_label?.toLocaleLowerCase('pt-PT')
    const by = manager && r.confirmed_by ? [`confirmado por ${r.confirmed_by}`] : []
    if (r.kind === 'service') return ['Serviço', method].filter(Boolean).join(' · ')
    if (r.kind === 'contribution' && r.purchase) {
      const p = r.purchase
      return [p.origin, p.line_count > 0 ? count(p.line_count, 'produto', 'produtos') : null,
        `compra de ${m(p.total_minor)}${p.salon_minor > 0 ? ` (Salão ${formatAmount(p.salon_minor, org)})` : ''}`, 'à parte'].filter(Boolean).join(' · ')
    }
    return [method, ...by, ...(r.note ? [`nota: «${r.note}»`] : [])].filter(Boolean).join(' · ')
  }
  const signed = (r: HistoryRow) => (r.kind === 'advance' || r.kind === 'payment' ? m(-r.amount_minor) : m(r.amount_minor))

  return (
    <section className="stack stack-loose">
      <div className="filter-chips" role="group" aria-label="Filtro">
        {FILTERS.map((f) => <button key={f.label} className="chip chip-outline" aria-pressed={filter === f.kind} onClick={() => onFilter(f.kind)}>{f.label}</button>)}
      </div>
      {loading && <Skeleton rows={3} />}
      {error && <ErrorState onRetry={onRetry}>Não foi possível carregar o histórico.</ErrorState>}
      <div className={stale ? 'stack busy' : 'stack'} aria-busy={stale || undefined} data-testid="history-list">
      {rows && total !== undefined && total > 0 && (
        <span className="support" data-testid="history-count">
          {total > rows.length ? `${total} registos neste período · mostra os ${rows.length} mais recentes` : `${count(total, 'registo', 'registos')} neste período`}
          {sumLine && <><br /><strong className="num">{sumLine}</strong></>}
        </span>
      )}
      {rows && rows.length === 0 && <EmptyState icon="receipt" title={empty} />}
      {days.map((d) => (
        <section key={d.key} className="stack">
          <span className="label">{formatDayShort(d.key, org.timezone)}</span>
          <ListGroup>
            {d.rows.map((r, i) => {
              const item = <ListRow leading={<span className="row-time">{formatTime(r.occurred_at, org.timezone)}</span>} title={r.title} subtitle={sub(r) || undefined}
                trailing={<span className={`row-value num${r.kind === 'contribution' ? ' muted' : ''}`}>{signed(r)}</span>} />
              return manager && (r.kind === 'service' || r.kind === 'advance') && s.period.state === 'aberto' ? (
                <div key={`${r.occurred_at}-${i}`} className="row-line">
                  {item}
                  <button className="icon-btn" aria-label={`Opções: ${r.title} · corrigir`} onClick={() => navigate(`/privado/anular/${r.kind}/${r.record_id}`)}><Icon name="more" /></button>
                </div>
              ) : <div key={`${r.occurred_at}-${i}`} className="row-line">{item}</div>
            })}
          </ListGroup>
        </section>
      ))}
      </div>
      {filter === 'advance' && <p className="note support">Adiantamentos são dinheiro recebido antes, por conta do que há a receber neste período. Entram no cálculo de «Falta receber».</p>}
      {filter === 'contribution' && s.contributions.count > 0 && (
        <>
          <ListGroup>
            <ListRow title="Contribuído em compras" trailing={<span className="row-value num">{m(s.contributions.total_minor)}</span>} />
            <ListRow title="Entra em «Falta receber»?" trailing={<span className="row-value">Não</span>} />
          </ListGroup>
          <p className="note support">
            Dinheiro que {manager ? s.person.display_name : 'pôs'}{manager ? ' pôs' : ''} em compras do salão. Fica registado à parte, com a compra, e não entra no cálculo do que falta receber.
          </p>
        </>
      )}
    </section>
  )
}
