// Negócio → Visão geral (Business Health Slice 01), private area, business.health.read. Every figure comes from the
// business_health read model (the Fecho calculation, ADR-0004); insights come from the business domain layer. This
// screen only arranges, words and links them. No person's figures appear here; for a viewer without team.finance.read
// a team-derived figure that would resolve to one other person arrives hidden (private_fields, 07 D9 · B11): it is
// said to be hidden, never shown as zero, "—" or not approved.
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { clearPrivateData, exitPrivateContext, usePrivateContext } from '../../modules/org/privateContext'
import { businessKeys, getBusinessHealth, getBusinessCosts, getBusinessServices, getBusinessTeam, listBusinessPeriods, type BusinessHealth, type Change, type PrivateField } from '../../modules/business/api'
import { buildInsights, costDrivers, COMPARISON_UNAVAILABLE } from '../../modules/business/insights'
import { INSIGHT_THRESHOLDS } from '../../modules/business/thresholds'
import { InsightCard } from './InsightCard'
import { HIDDEN, hiddenWhy } from './hidden'
import { STATE_LABEL } from '../../modules/period/api'
import { toAppError } from '../../shared/errors'
import { formatMoney } from '../../shared/money'
import { formatDayShort } from '../../shared/time'

const pctText = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${String(Math.abs(n)).replace('.', ',')}%`

export function OverviewPage() {
  const org = useOrganization()
  const ctx = usePrivateContext()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [sp, setSp] = useSearchParams()
  const p = sp.get('p')
  const health = useQuery({ queryKey: businessKeys.health(p), queryFn: () => getBusinessHealth(p) })
  const periods = useQuery({ queryKey: businessKeys.periods, queryFn: listBusinessPeriods })
  const team = useQuery({ queryKey: businessKeys.team(p), queryFn: () => getBusinessTeam(p) })   // team concentration insight
  const services = useQuery({ queryKey: businessKeys.services(p), queryFn: () => getBusinessServices(p) })   // service insights
  const costs = useQuery({ queryKey: businessKeys.costs(p), queryFn: () => getBusinessCosts(p) })   // purchase and product insights
  const lost = [health.error, periods.error].some((e) => e && toAppError(e).code === 'VERIFICATION_REQUIRED')
  useEffect(() => { if (lost) clearPrivateData(qc) }, [lost, qc])
  const back = () => navigate(ctx.view === 'manager' ? '/privado/equipa' : '/')
  const m = (n: number) => formatMoney(n, org)

  const header = (
    <header className="flow-header-row">
      <button className="icon-btn" aria-label="Voltar" onClick={back}>←</button>
      <span className="muted" style={{ fontWeight: 600 }}>Negócio · Visão geral</span>
      <span className="priv">Privado</span>
    </header>
  )
  if (health.isPending) return <main className="app-main">{header}<p className="muted">A carregar…</p></main>
  if (health.isError) {
    const code = toAppError(health.error).code
    return (
      <main className="app-main">{header}
        <div className="notice notice-error" role="alert">
          {code === 'NOT_AUTHORIZED' ? 'Esta área é só para quem acompanha o negócio.' : 'Não foi possível mostrar a visão do negócio.'}
        </div>
        <button className="btn btn-secondary" onClick={back}>Voltar</button>
      </main>
    )
  }

  const h = health.data
  const c = h.current
  const { insights } = buildInsights(h, m, INSIGHT_THRESHOLDS, team.data, services.data, costs.data)
  const pending = c.pending_rules_count > 0
  const hidden = (k: PrivateField) => c.private_fields.includes(k)

  return (
    <main className="app-main">
      {header}

      <section className="stack" style={{ gap: '0.5rem' }} data-testid="period-context">
        <h2 style={{ margin: 0 }}>{c.period.label}</h2>
        <span className="muted">
          {formatDayShort(c.period.starts_on, org.timezone)} – {formatDayShort(c.period.ends_on, org.timezone)} · {STATE_LABEL[c.period.state]}
          {c.period.is_complete ? '' : ' · a decorrer'}
        </span>
        {periods.data && periods.data.length > 1 && (
          <label className="field">
            <select aria-label="Período" value={c.period.id} onChange={(e) => setSp({ p: e.target.value }, { replace: true })}>
              {periods.data.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
        )}
      </section>

      <section className="stack" aria-labelledby="como-estamos">
        <h3 id="como-estamos" className="label">Como estamos?</h3>
        <dl className="kv-card" data-testid="overview">
          <div><dt>Produção</dt><dd className="num">{m(c.production_minor)}<span className="muted"> · {c.services_count} serviços</span></dd></div>
          <div><dt>Resultado operacional</dt><dd className="num">{hidden('operating_result_minor') ? HIDDEN : c.operating_result_minor === null ? '—' : m(c.operating_result_minor)}
            {c.operating_costs_minor !== null && <span className="muted"> · custos {m(c.operating_costs_minor)}</span>}</dd></div>
          <div><dt>Livre</dt><dd className="num">{hidden('free_minor') ? HIDDEN : c.free_minor === null ? '—' : m(c.free_minor)}</dd></div>
          <div><dt>A pagar à equipa</dt><dd className="num">{hidden('unpaid_team_minor') ? HIDDEN : c.unpaid_team_minor === null ? 'Ainda não aprovado' : m(c.unpaid_team_minor)}</dd></div>
        </dl>
        {c.private_fields.length > 0 && <span className="muted" style={{ fontSize: '0.875rem' }} data-testid="team-private">{hiddenWhy(c.private_fields)}</span>}
        {pending && <div className="notice notice-neutral">Há {c.pending_rules_count === 1 ? '1 regra' : `${c.pending_rules_count} regras`} de remuneração por definir: os custos, o resultado e o livre ficam por calcular até lá.</div>}
        {c.source === 'close_statement' && <span className="muted" style={{ fontSize: '0.875rem' }}>Valores do fecho deste período.</span>}
      </section>

      <section className="stack" style={{ gap: '0.25rem' }} data-testid="retention">
        <h3 className="label">Retenção operacional</h3>
        <strong className="num" style={{ fontSize: '1.5rem' }}>{hidden('retention_pct') ? HIDDEN : c.retention_pct === null ? '—' : pctText(c.retention_pct).replace('+', '')}</strong>
        <span className="muted" style={{ fontSize: '0.875rem' }}>
          {hidden('retention_pct') ? hiddenWhy(c.private_fields) : c.retention_pct === null ? (c.production_minor === 0 ? 'Sem produção neste período.' : 'Por calcular enquanto houver regras por definir.')
            : 'da produção ficou como resultado operacional.'}
        </span>
      </section>

      <Changes h={h} m={m} />

      <section className="stack" aria-labelledby="atencao">
        <h3 id="atencao" className="label">Precisa da tua atenção</h3>
        {insights.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nada a assinalar neste período.</p>
          : insights.map((i) => <InsightCard key={i.id} insight={i} finance={ctx.view === 'manager'} />)}
      </section>

      {h.trend.length > 1 && (
        <section className="stack" aria-labelledby="tendencia">
          <h3 id="tendencia" className="label">Últimos períodos</h3>
          <dl className="kv-card" data-testid="trend">
            {h.trend.map((t) => (
              <div key={t.id}><dt>{t.label}{t.is_complete ? '' : ' (a decorrer)'}</dt>
                <dd className="num">{m(t.production_minor)}<span className="muted"> · resultado {t.result_private ? HIDDEN.toLowerCase() : t.operating_result_minor === null ? '—' : m(t.operating_result_minor)}</span></dd></div>
            ))}
          </dl>
        </section>
      )}

      <button className="pick" onClick={() => navigate(`/privado/negocio/equipa?p=${c.period.id}`)}><strong>Equipa</strong><span aria-hidden className="muted">›</span></button>
      <button className="pick" onClick={() => navigate(`/privado/negocio/servicos?p=${c.period.id}`)}><strong>Serviços</strong><span aria-hidden className="muted">›</span></button>
      <button className="pick" onClick={() => navigate(`/privado/negocio/custos?p=${c.period.id}`)}><strong>Custos & Stock</strong><span aria-hidden className="muted">›</span></button>
      {ctx.view === 'manager' && <button className="pick" onClick={() => navigate(`/privado/fecho?p=${c.period.id}`)}><strong>Fecho do período</strong><span aria-hidden className="muted">›</span></button>}
      <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={async () => { await exitPrivateContext(qc); navigate('/') }}>Sair da área privada</button>
    </main>
  )
}

function changeLine(label: string, ch: Change, m: (n: number) => string, hide = false) {
  if (hide) return `${label} não mostrado`
  if (ch.delta_minor === null) return `${label} por calcular`
  const delta = `${ch.delta_minor > 0 ? '+' : ''}${m(ch.delta_minor)}`
  return ch.percent === null ? `${label} ${delta}` : `${label} ${pctText(ch.percent)} (${delta})`
}

function Changes({ h, m }: { h: BusinessHealth; m: (n: number) => string }) {
  const prev = h.meta.comparison.previous, avg = h.meta.comparison.average_3
  const drivers = costDrivers(h, m)
  const hid = (x: { private_fields: PrivateField[] } | null) => !!x?.private_fields.includes('operating_result_minor')
  const resPrev = hid(h.current) || hid(h.previous), resAvg = hid(h.current) || hid(h.average_3)
  return (
    <section className="stack" aria-labelledby="mudou" data-testid="changes">
      <h3 id="mudou" className="label">O que mudou?</h3>
      {h.changes.previous ? (
        <p style={{ margin: 0 }}>Face a {prev.period?.label}: {changeLine('produção', h.changes.previous.production_minor, m)} · {changeLine('resultado', h.changes.previous.operating_result_minor, m, resPrev)}.</p>
      ) : <p className="muted" style={{ margin: 0 }}>{COMPARISON_UNAVAILABLE[prev.reason ?? 'no_previous_period']}</p>}
      {h.changes.average_3 ? (
        <p style={{ margin: 0 }}>Face à média dos últimos {avg.window} períodos fechados: {changeLine('produção', h.changes.average_3.production_minor, m)} · {changeLine('resultado', h.changes.average_3.operating_result_minor, m, resAvg)}.</p>
      ) : avg.reason !== prev.reason && <p className="muted" style={{ margin: 0 }}>{COMPARISON_UNAVAILABLE[avg.reason ?? 'insufficient_history']}</p>}
      {drivers.length > 0 && (
        <div className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted" style={{ fontSize: '0.875rem' }}>Custos que mais subiram face a {prev.period?.label}:</span>
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>{drivers.map((d) => <li key={d.label} className="num">{d.label} {d.text}</li>)}</ul>
        </div>
      )}
    </section>
  )
}
