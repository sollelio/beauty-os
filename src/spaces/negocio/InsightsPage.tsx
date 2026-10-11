// Negócio → Insights (Business Health Slice 06), private area, business.health.read. "What deserves my attention, why,
// and what can I do next?" Every insight comes from the one engine (modules/business/insights) over the same
// privacy-redacted reads as the other Negócio pages: a figure hidden there (07 D9 · B11) is never an input here. Open
// situations are read as of now; the analysis follows the selected period. Nothing is stored: a resolved situation
// simply disappears (no resolution history in V1).
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { clearPrivateData, usePrivateContext } from '../../modules/org/privateContext'
import { businessKeys, getBusinessCosts, getBusinessHealth, getBusinessServices, getBusinessTeam, listBusinessPeriods } from '../../modules/business/api'
import { buildInsightHub, COMPARISON_UNAVAILABLE, SEVERITY_LABEL, SEVERITY_ORDER, type Insight, type Severity } from '../../modules/business/insights'
import { InsightCard } from './InsightCard'
import { hiddenWhy } from './hidden'
import { STATE_LABEL } from '../../modules/period/api'
import { toAppError } from '../../shared/errors'
import { formatMoney } from '../../shared/money'
import { formatDayShort } from '../../shared/time'

type Filter = 'all' | Severity

export function InsightsPage() {
  const org = useOrganization()
  const ctx = usePrivateContext()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [sp, setSp] = useSearchParams()
  const p = sp.get('p')
  const [filter, setFilter] = useState<Filter>('all')
  // the selected period's reads (its analysis) …
  const health = useQuery({ queryKey: businessKeys.health(p), queryFn: () => getBusinessHealth(p) })
  const team = useQuery({ queryKey: businessKeys.team(p), queryFn: () => getBusinessTeam(p) })
  const services = useQuery({ queryKey: businessKeys.services(p), queryFn: () => getBusinessServices(p) })
  const costs = useQuery({ queryKey: businessKeys.costs(p), queryFn: () => getBusinessCosts(p) })
  // … and the current period's (the open situations, as of now); the same queries when no period is selected
  const nowHealth = useQuery({ queryKey: businessKeys.health(null), queryFn: () => getBusinessHealth(null) })
  const nowCosts = useQuery({ queryKey: businessKeys.costs(null), queryFn: () => getBusinessCosts(null) })
  const periods = useQuery({ queryKey: businessKeys.periods, queryFn: listBusinessPeriods })
  const lost = [health.error, nowHealth.error, periods.error].some((e) => e && toAppError(e).code === 'VERIFICATION_REQUIRED')
  useEffect(() => { if (lost) clearPrivateData(qc) }, [lost, qc])
  const back = () => navigate(p ? `/privado/negocio?p=${p}` : '/privado/negocio')
  const m = (n: number) => formatMoney(n, org)

  const header = (
    <header className="flow-header-row">
      <button className="icon-btn" aria-label="Voltar" onClick={back}>←</button>
      <span className="muted" style={{ fontWeight: 600 }}>Negócio · Insights</span>
      <span className="priv">Privado</span>
    </header>
  )
  const error = health.error ?? nowHealth.error
  if (error) {
    const code = toAppError(error).code
    return (
      <main className="app-main">{header}
        <div className="notice notice-error" role="alert">
          {code === 'NOT_AUTHORIZED' ? 'Esta área é só para quem acompanha o negócio.' : 'Não foi possível mostrar os insights.'}
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>Voltar</button>
      </main>
    )
  }
  if (!health.data || !nowHealth.data) return <main className="app-main">{header}<p className="muted">A carregar…</p></main>

  const h = health.data, now = nowHealth.data
  const c = h.current
  const hub = buildInsightHub({ health: now, costs: nowCosts.data },
                              { health: h, team: team.data, services: services.data, costs: costs.data }, m)
  const shown = (list: Insight[]) => filter === 'all' ? list : list.filter((i) => i.severity === filter)
  const active = shown(hub.active), analysis = shown(hub.period)
  const isNow = c.period.id === now.current.period.id
  const prevMeta = h.meta.comparison.previous
  const finance = ctx.view === 'manager'
  const total = hub.active.length + hub.period.length

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

      <section className="stack" style={{ gap: '0.5rem' }} aria-label="Resumo">
        <dl className="kv-card" data-testid="severity-counts">
          {SEVERITY_ORDER.map((s) => <div key={s}><dt>{SEVERITY_LABEL[s]}</dt><dd className="num">{hub.counts[s]}</dd></div>)}
        </dl>
        <div role="group" aria-label="Filtrar" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {(['all', ...SEVERITY_ORDER] as Filter[]).map((f) => (
            <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Todos' : SEVERITY_LABEL[f]}
            </button>
          ))}
        </div>
      </section>

      <section className="stack" aria-labelledby="agora" data-testid="active">
        <h3 id="agora" className="label">Por resolver agora</h3>
        {active.length === 0 ? <p className="muted" style={{ margin: 0 }}>{hub.active.length === 0 ? 'Nada por resolver.' : 'Nada com este filtro.'}</p>
          : active.map((i) => <InsightCard key={i.id} insight={i} finance={finance} hub />)}
        {now.open_periods.some((x) => x.unpaid_private) && <span className="muted" style={{ fontSize: '0.875rem' }} data-testid="active-private">{hiddenWhy(['unpaid_team_minor'])}</span>}
        <span className="muted" style={{ fontSize: '0.875rem' }}>Situações em aberto hoje{isNow ? '' : `, seja qual for o período escolhido`}; desaparecem quando ficam resolvidas.</span>
      </section>

      <section className="stack" aria-labelledby="analise" data-testid="analysis">
        <h3 id="analise" className="label">Em {c.period.label}</h3>
        {analysis.length === 0 ? <p className="muted" style={{ margin: 0 }}>{hub.period.length === 0 ? 'Nada a assinalar neste período.' : 'Nada com este filtro.'}</p>
          : analysis.map((i) => <InsightCard key={i.id} insight={i} finance={finance} hub />)}
        {!prevMeta.available && <span className="muted" style={{ fontSize: '0.875rem' }} data-testid="insufficient">Sem comparação com o período anterior: {COMPARISON_UNAVAILABLE[prevMeta.reason ?? 'no_previous_period']}</span>}
        {c.private_fields.length > 0 && <span className="muted" style={{ fontSize: '0.875rem' }} data-testid="analysis-private">{hiddenWhy(c.private_fields)} Nenhum insight usa esses valores.</span>}
      </section>

      {h.trend.length > 1 && (
        <section className="stack" aria-labelledby="historico">
          <h3 id="historico" className="label">Períodos recentes</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }} data-testid="history">
            {[...h.trend].reverse().map((t) => (
              <button key={t.id} className={`btn ${t.id === c.period.id ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={t.id === c.period.id}
                onClick={() => setSp({ p: t.id }, { replace: true })}>{t.label}</button>
            ))}
          </div>
        </section>
      )}

      {total === 0 && <span className="muted" data-testid="none">Os insights aparecem quando há dados suficientes; sem dados suficientes não há conclusões.</span>}
    </main>
  )
}
