// Situação do profissional / A minha situação (Slice 04). Every figure is read from the database read model; this
// screen only arranges and words them. Manager view (B4) shows attributions; the self view (B3) never does.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { clearPrivateData, exitPrivateContext } from '../../modules/org/privateContext'
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
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [periodId, setPeriodId] = useState<string | null>(null)
  const [tab, setTab] = useState<'resumo' | 'hist'>('resumo')
  const [filter, setFilter] = useState<HistoryKind | null>(null)
  const [sheet, setSheet] = useState<null | 'explain' | 'period'>(null)

  const situation = useQuery({ queryKey: situationKeys.situation(personId, periodId), queryFn: () => getSituation(personId, periodId) })
  const history = useQuery({ queryKey: situationKeys.history(personId, periodId, filter), queryFn: () => getHistory(personId, periodId, filter), enabled: tab === 'hist' })
  const periods = useQuery({ queryKey: situationKeys.periods(personId), queryFn: () => listPeriods(personId), enabled: sheet === 'period' })

  // The server ended the context (expiry, revocation, another holder): drop everything sensitive.
  const lost = [situation.error, history.error, periods.error].some((e) => e && toAppError(e).code === 'VERIFICATION_REQUIRED')
  useEffect(() => { if (lost) clearPrivateData(qc) }, [lost, qc])

  if (situation.isPending) return <main className="app-main"><p className="muted">A carregar…</p></main>
  if (situation.isError) {
    return (
      <main className="app-main">
        <div className="notice notice-error" role="alert">Não foi possível mostrar esta situação.</div>
        <button className="btn btn-secondary" onClick={() => navigate('/privado')}>Voltar</button>
      </main>
    )
  }

  const s = situation.data
  const manager = s.view === 'manager'
  const goHist = (k: HistoryKind | null) => { setFilter(k); setTab('hist') }
  const back = () => (manager ? navigate('/privado/equipa') : navigate('/'))

  return (
    <main className="app-main">
      <header className="stack" style={{ gap: '0.75rem' }}>
        <div className="flow-header-row">
          <button className="icon-btn" aria-label={manager ? 'Voltar à Equipa' : 'Voltar'} onClick={back}>←</button>
          <span className="muted" style={{ fontWeight: 600 }}>{manager ? 'Situação do profissional' : 'A minha situação'}</span>
          <span className="priv">Privado</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="avatar" aria-hidden>{s.person.display_name.slice(0, 1)}</span>
          <div className="grow">
            <h1 style={{ fontSize: '1.5rem' }}>{s.person.display_name}</h1>
            <span className="muted" style={{ fontSize: '0.875rem' }}>{s.person.capabilities.join(' · ')}</span>
          </div>
          <button className="chip chip-outline" aria-label={`Período: ${s.period.label}`} onClick={() => setSheet('period')}>{s.period.label} ▾</button>
        </div>
        <div className="segmented" role="group" aria-label="Secção">
          <button className="seg" aria-pressed={tab === 'resumo'} onClick={() => setTab('resumo')}>Resumo</button>
          <button className="seg" aria-pressed={tab === 'hist'} onClick={() => goHist(null)}>Histórico</button>
        </div>
      </header>

      {tab === 'resumo'
        ? <Summary s={s} onExplain={() => setSheet('explain')} onHistory={goHist} />
        : <HistoryView s={s} filter={filter} onFilter={setFilter} rows={history.data?.rows} total={history.data?.total_count} />}

      <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={async () => { await exitPrivateContext(qc); navigate('/') }}>Sair da área privada</button>

      {sheet === 'explain' && <ExplainSheet s={s} onClose={() => setSheet(null)} />}
      {sheet === 'period' && (
        <div className="sheet" role="dialog" aria-labelledby="pe-title" onClick={() => setSheet(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <div className="flow-header-row"><h2 id="pe-title" style={{ fontSize: '1.25rem' }}>Período</h2><button className="icon-btn" aria-label="Fechar" onClick={() => setSheet(null)}>×</button></div>
            {periods.data?.map((p) => {
              const on = p.id === s.period.id
              return (
                <button key={p.id} className="pick" aria-current={on} style={on ? { borderColor: 'var(--accent)', borderWidth: '1.5px' } : undefined}
                  onClick={() => { setPeriodId(p.id); setSheet(null) }}>
                  <span><strong style={{ display: 'block' }}>{p.label}</strong><span className="muted" style={{ fontSize: '0.875rem' }}>{STATE_LABEL[p.state]}</span></span>
                  {on ? <span aria-hidden style={{ color: 'var(--accent)', fontWeight: 700 }}>✓</span>
                    : p.payments_total_minor > 0 && <span className="num muted" style={{ fontWeight: 600 }}>{formatMoney(p.payments_total_minor, org)}</span>}
                </button>
              )
            })}
            <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>Períodos fechados só se alteram por reabertura autorizada no Fecho.</p>
          </div>
        </div>
      )}
    </main>
  )
}

function Summary({ s, onExplain, onHistory }: { s: Situation; onExplain: () => void; onHistory: (k: HistoryKind) => void }) {
  const org = useOrganization()
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const manager = s.view === 'manager'
  const determinate = s.rule.kind === 'standing' && s.earned_minor !== null
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
        <button className="headline" onClick={onExplain}>
          <span className="label">Falta receber · {state}</span>
          <span className="num headline-value" data-testid="remaining">{m(s.remaining_minor ?? 0)}</span>
          <span className="num muted" data-testid="derivation">{excess ? `${derivation} = ${g(s.difference_minor ?? 0)}` : `= ${derivation}`}</span>
          <span className="headline-link">Como se chega a este valor? ›</span>
        </button>
      ) : (
        <button className="headline" onClick={onExplain}>
          <span className="label">Falta receber · {state}</span>
          <span className="headline-value muted" data-testid="remaining">—</span>
          <span className="muted">Por determinar: a regra deste período ainda não foi definida.</span>
        </button>
      )}
      {determinate && excess && (
        <div className="notice notice-warning" role="status">Recebeu mais do que o ganho até agora ({m(s.excess_minor ?? 0)}). O que acontece a essa diferença é decidido pela gestão.</div>
      )}
      {!determinate && (
        <div className="notice notice-warning" role="status">Até a regra ser definida não há valor ganho nem valor a receber. A produção e os adiantamentos ficam registados e entram no cálculo nessa altura.</div>
      )}

      <section className="breakdown">
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
      </section>

      {s.contributions.count > 0 && (
        <section className="stack">
          <span className="label">À parte</span>
          <button className="pick" onClick={() => onHistory('contribution')}>
            <span><strong style={{ display: 'block' }}>Contribuições em compras</strong><span className="muted" style={{ fontSize: '0.875rem' }}>{count(s.contributions.count, 'compra', 'compras')} neste período</span></span>
            <span className="num" style={{ fontWeight: 600 }}>{m(s.contributions.total_minor)}</span>
          </button>
          <span className="muted" style={{ fontSize: '0.875rem' }}>Registado à parte. Não é descontado nem somado ao valor a receber.</span>
        </section>
      )}

      <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
        {!manager ? 'Vê apenas os seus registos. Se algum valor não bater certo, fale com a gestão.'
          : `${determinate && rule?.set_by ? `Regra definida por ${rule.set_by} em ${formatDayShort(rule.set_at, org.timezone)}. ` : determinate ? '' : 'A regra deste período ainda não foi definida. '}Correcções a registos ficam no histórico com quem as fez.`}
      </p>
    </>
  )
}

function Row({ title, sub, value, onOpen, tone }: { title: string; sub: string; value: string; onOpen?: () => void; tone?: 'muted' | 'warning' }) {
  const body = (
    <>
      <span className="grow"><strong style={{ display: 'block' }}>{title}</strong><span className="muted num" style={{ fontSize: '0.875rem' }}>{sub}</span></span>
      <span className={`num brow-value${tone ? ` tone-${tone}` : ''}`}>{value}</span>
      <span aria-hidden className="muted" style={{ width: '1rem' }}>{onOpen ? '›' : ''}</span>
    </>
  )
  return onOpen ? <button className="brow" onClick={onOpen}>{body}</button> : <div className="brow">{body}</div>
}

function ExplainSheet({ s, onClose }: { s: Situation; onClose: () => void }) {
  const org = useOrganization()
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const manager = s.view === 'manager'
  const rule = s.rule.kind === 'standing' ? s.rule : null
  const determinate = rule !== null && s.earned_minor !== null
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
    <div className="sheet" role="dialog" aria-labelledby="ex-title" onClick={onClose}>
      <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
        <div className="flow-header-row"><h2 id="ex-title" style={{ fontSize: '1.25rem' }}>{title}</h2><button className="icon-btn" aria-label="Fechar" onClick={onClose}>×</button></div>
        <ol className="explain" data-testid="explanation">
          {steps.map(([h, b]) => <li key={h}><strong>{h}</strong><br /><span className="muted num">{b}</span></li>)}
        </ol>
        {determinate && s.contributions.count > 0 && (
          <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>Contribuições em compras ({m(s.contributions.total_minor)}) ficam à parte e não entram neste cálculo.</p>
        )}
      </div>
    </div>
  )
}

function HistoryView({ s, filter, onFilter, rows, total }: {
  s: Situation; filter: HistoryKind | null; onFilter: (k: HistoryKind | null) => void; rows?: HistoryRow[]; total?: number
}) {
  const org = useOrganization()
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
    <section className="stack" style={{ gap: '0.875rem' }}>
      <div className="filter-chips" role="group" aria-label="Filtro">
        {FILTERS.map((f) => <button key={f.label} className="chip chip-outline" aria-pressed={filter === f.kind} onClick={() => onFilter(f.kind)}>{f.label}</button>)}
      </div>
      {rows && total !== undefined && total > 0 && (
        <span className="muted" style={{ fontSize: '0.875rem' }} data-testid="history-count">
          {total > rows.length ? `${total} registos neste período · mostra os ${rows.length} mais recentes` : `${count(total, 'registo', 'registos')} neste período`}
          {sumLine && <><br /><strong className="num">{sumLine}</strong></>}
        </span>
      )}
      {rows && rows.length === 0 && <p className="muted" style={{ margin: 0 }}>{empty}</p>}
      {days.map((d) => (
        <div key={d.key} className="list">
          <span className="label" style={{ padding: '0.375rem 0' }}>{formatDayShort(d.key, org.timezone)}</span>
          {d.rows.map((r, i) => (
            <div key={`${r.occurred_at}-${i}`} className="list-row">
              <span className="num muted" style={{ width: '2.75rem', fontSize: '0.875rem' }}>{formatTime(r.occurred_at, org.timezone)}</span>
              <span className="grow"><strong style={{ display: 'block' }}>{r.title}</strong><span className="muted" style={{ fontSize: '0.8125rem' }}>{sub(r)}</span></span>
              <span className={`num${r.kind === 'contribution' ? ' muted' : ''}`} style={{ fontWeight: 600 }}>{signed(r)}</span>
            </div>
          ))}
        </div>
      ))}
      {filter === 'advance' && <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>Adiantamentos são dinheiro recebido antes, por conta do que há a receber neste período. Entram no cálculo de «Falta receber».</p>}
      {filter === 'contribution' && s.contributions.count > 0 && (
        <>
          <dl className="kv-card">
            <div><dt>Contribuído em compras</dt><dd className="num">{m(s.contributions.total_minor)}</dd></div>
            <div><dt>Entra em «Falta receber»?</dt><dd>Não</dd></div>
          </dl>
          <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
            Dinheiro que {manager ? s.person.display_name : 'pôs'}{manager ? ' pôs' : ''} em compras do salão. Fica registado à parte, com a compra, e não entra no cálculo do que falta receber.
          </p>
        </>
      )}
    </section>
  )
}
