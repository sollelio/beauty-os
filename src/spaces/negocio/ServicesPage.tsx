// Negócio → Serviços (Business Health Slice 03), private area, business.health.read. What customers buy, what
// generates value and how demand moves: per service (never per person) from the business_services read model; the
// service insights come from the business domain layer. Neutral order (revenue, count), no "best"/"worst", and no
// claim about marketing, campaigns or why demand moved. A service with a single performer arrives inside "Outros
// serviços" for a viewer without team.finance.read (07 D9 · B11).
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { clearPrivateData, usePrivateContext } from '../../modules/org/privateContext'
import { businessKeys, getBusinessServices, listBusinessPeriods, type BusinessServices, type ServiceRow } from '../../modules/business/api'
import { COMPARISON_UNAVAILABLE, serviceInsights } from '../../modules/business/insights'
import { STATE_LABEL } from '../../modules/period/api'
import { toAppError } from '../../shared/errors'
import { formatMoney } from '../../shared/money'
import { formatDayShort } from '../../shared/time'
import { InsightCard } from './InsightCard'

const pctText = (n: number) => `${String(n).replace('.', ',')}%`
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${String(Math.abs(n)).replace('.', ',')}%`
const TOP = 3

export function ServicesPage() {
  const org = useOrganization()
  const ctx = usePrivateContext()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [sp, setSp] = useSearchParams()
  const p = sp.get('p')
  const q = useQuery({ queryKey: businessKeys.services(p), queryFn: () => getBusinessServices(p) })
  const periods = useQuery({ queryKey: businessKeys.periods, queryFn: listBusinessPeriods })
  const lost = [q.error, periods.error].some((e) => e && toAppError(e).code === 'VERIFICATION_REQUIRED')
  useEffect(() => { if (lost) clearPrivateData(qc) }, [lost, qc])
  const m = (n: number) => formatMoney(n, org)
  const back = () => navigate(p ? `/privado/negocio?p=${p}` : '/privado/negocio')

  const header = (
    <header className="flow-header-row">
      <button className="icon-btn" aria-label="Voltar" onClick={back}>←</button>
      <span className="muted" style={{ fontWeight: 600 }}>Negócio · Serviços</span>
      <span className="priv">Privado</span>
    </header>
  )
  if (q.isPending) return <main className="app-main">{header}<p className="muted">A carregar…</p></main>
  if (q.isError) {
    const code = toAppError(q.error).code
    return (
      <main className="app-main">{header}
        <div className="notice notice-error" role="alert">
          {code === 'NOT_AUTHORIZED' ? 'Esta área é só para quem acompanha o negócio.' : 'Não foi possível mostrar os serviços.'}
        </div>
        <button className="btn btn-secondary" onClick={back}>Voltar</button>
      </main>
    )
  }

  const s = q.data
  const sum = s.summary
  const { insights } = serviceInsights(s, m)
  const byCount = [...s.services].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const prev = s.comparison.previous, before = s.comparison.before_previous

  return (
    <main className="app-main">
      {header}

      <section className="stack" style={{ gap: '0.5rem' }} data-testid="period-context">
        <h2 style={{ margin: 0 }}>{s.period.label}</h2>
        <span className="muted">
          {formatDayShort(s.period.starts_on, org.timezone)} – {formatDayShort(s.period.ends_on, org.timezone)} · {STATE_LABEL[s.period.state]}
          {s.period.is_complete ? '' : ' · a decorrer'}
        </span>
        {periods.data && periods.data.length > 1 && (
          <label className="field">
            <select aria-label="Período" value={s.period.id} onChange={(e) => setSp({ p: e.target.value }, { replace: true })}>
              {periods.data.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
        )}
      </section>

      <section className="stack" aria-labelledby="servicos-resumo">
        <h3 id="servicos-resumo" className="label">Neste período</h3>
        <dl className="kv-card" data-testid="services-summary">
          <div><dt>Produção</dt><dd className="num">{m(sum.production_minor)}</dd></div>
          <div><dt>Serviços realizados</dt><dd className="num">{sum.services_count}</dd></div>
          <div><dt>Ticket médio</dt><dd className="num">{sum.average_ticket_minor === null ? '—' : m(sum.average_ticket_minor)}</dd></div>
          <div><dt>Serviços diferentes</dt><dd className="num">{sum.distinct_services}</dd></div>
        </dl>
      </section>

      {insights.length > 0 && (
        <section className="stack" aria-label="Atenção">
          {insights.map((i) => <InsightCard key={i.id} insight={i} finance={ctx.view === 'manager'} />)}
        </section>
      )}

      {s.services.length === 0 && !s.other ? <p className="muted" style={{ margin: 0 }}>Sem serviços registados neste período.</p> : (
        <>
          <section className="stack" aria-labelledby="mais-receita" data-testid="top-revenue">
            <h3 id="mais-receita" className="label">Mais receita</h3>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {s.services.slice(0, TOP).map((x) => <li key={x.service_id} className="num">{x.name} · {m(x.revenue_minor)}</li>)}
            </ol>
          </section>
          <section className="stack" aria-labelledby="mais-realizados" data-testid="top-count">
            <h3 id="mais-realizados" className="label">Mais realizados</h3>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {byCount.slice(0, TOP).map((x) => <li key={x.service_id} className="num">{x.name} · {x.count}</li>)}
            </ol>
          </section>

          <section className="stack" aria-labelledby="distribuicao">
            <h3 id="distribuicao" className="label">Distribuição da produção</h3>
            {!prev.available ? <p className="muted" style={{ margin: 0 }} data-testid="services-comparison-unavailable">{COMPARISON_UNAVAILABLE[prev.reason ?? 'no_previous_period']}</p>
              : !before.available && <p className="muted" style={{ margin: 0 }} data-testid="services-trend-unavailable">
                  Crescimento ou queda precisam de três períodos comparáveis: ainda há só dois.</p>}
            <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {s.services.map((x) => <ServiceCard key={x.service_id} x={x} s={s} m={m} />)}
              {s.other && (
                <li className="stack" style={{ gap: '0.25rem' }} data-testid="services-other">
                  <strong>Outros serviços ({s.other.services})</strong>
                  <span className="num">{s.other.count} · {m(s.other.revenue_minor)}</span>
                  <span className="muted" style={{ fontSize: '0.875rem' }}>Juntos, porque sozinhos mostrariam a produção de uma só pessoa.</span>
                </li>
              )}
            </ul>
            <span className="muted" style={{ fontSize: '0.875rem' }}>Ordenado pela receita do período. Valores registados, não preços de tabela.</span>
          </section>
        </>
      )}
    </main>
  )
}

function ServiceCard({ x, s, m }: { x: ServiceRow; s: BusinessServices; m: (n: number) => string }) {
  const prev = s.comparison.previous.period?.label
  let change: string | null = null
  if (x.change && x.previous) {
    const c = x.change.count, r = x.change.revenue
    change = x.previous.count === 0 ? `Sem registos em ${prev}`
      : `Face a ${prev}: ${c.percent === null ? `${(c.delta_minor ?? 0) > 0 ? '+' : ''}${c.delta_minor}` : signed(c.percent)} em quantidade · ${r.percent === null ? m(r.delta_minor ?? 0) : signed(r.percent)} em receita`
  }
  return (
    <li className="stack" style={{ gap: '0.5rem' }} data-testid="service">
      <strong>{x.name}</strong>
      <div aria-hidden style={{ height: 6, borderRadius: 3, background: 'var(--line)' }}>
        <div style={{ width: `${Math.min(100, x.share_pct ?? 0)}%`, height: '100%', borderRadius: 3, background: 'var(--muted)' }} />
      </div>
      <dl className="kv-card">
        <div><dt>Quantidade</dt><dd className="num">{x.count}</dd></div>
        <div><dt>Receita</dt><dd className="num">{m(x.revenue_minor)}</dd></div>
        <div><dt>Ticket médio</dt><dd className="num">{m(x.average_ticket_minor)}</dd></div>
        <div><dt>Parte da produção</dt><dd className="num">{x.share_pct === null ? '—' : pctText(x.share_pct)}</dd></div>
      </dl>
      {change && <span className="muted num" style={{ fontSize: '0.875rem' }} data-testid="service-change">{change}</span>}
    </li>
  )
}
