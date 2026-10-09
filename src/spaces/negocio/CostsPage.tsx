// Negócio → Custos & Stock (Business Health Slice 04), private area, business.health.read. Where the money goes, what
// changed and which products keep coming back: expense categories and salon-funded purchases from business_costs
// (whose period figures and references are business_health's own), Stock Lite as people set it. Insights come from
// the business domain layer. No person, no contribution, no stock quantities or consumption (Stock Lite has none).
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { clearPrivateData, usePrivateContext } from '../../modules/org/privateContext'
import { businessKeys, getBusinessCosts, getBusinessHealth, listBusinessPeriods, type Change, type CostCategory } from '../../modules/business/api'
import { buildInsights, COMPARISON_UNAVAILABLE, costInsights, sortInsights } from '../../modules/business/insights'
import { STATE_LABEL } from '../../modules/period/api'
import { toAppError } from '../../shared/errors'
import { formatMoney } from '../../shared/money'
import { formatDayShort } from '../../shared/time'
import { InsightCard } from './InsightCard'
import { HIDDEN, HIDDEN_WHY_CONTRIBUTION } from './hidden'

const pctText = (n: number) => `${String(n).replace('.', ',')}%`
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${String(Math.abs(n)).replace('.', ',')}%`
const STOCK_LABEL = { ok: 'OK', baixo: 'Baixo', comprar: 'Comprar' } as const

export function CostsPage() {
  const org = useOrganization()
  const ctx = usePrivateContext()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [sp, setSp] = useSearchParams()
  const p = sp.get('p')
  const q = useQuery({ queryKey: businessKeys.costs(p), queryFn: () => getBusinessCosts(p) })
  const health = useQuery({ queryKey: businessKeys.health(p), queryFn: () => getBusinessHealth(p) })   // insight 5
  const periods = useQuery({ queryKey: businessKeys.periods, queryFn: listBusinessPeriods })
  const lost = [q.error, health.error, periods.error].some((e) => e && toAppError(e).code === 'VERIFICATION_REQUIRED')
  useEffect(() => { if (lost) clearPrivateData(qc) }, [lost, qc])
  const m = (n: number) => formatMoney(n, org)
  const day = (iso: string) => formatDayShort(iso.slice(0, 10), org.timezone)
  const back = () => navigate(p ? `/privado/negocio?p=${p}` : '/privado/negocio')

  const header = (
    <header className="flow-header-row">
      <button className="icon-btn" aria-label="Voltar" onClick={back}>←</button>
      <span className="muted" style={{ fontWeight: 600 }}>Negócio · Custos & Stock</span>
      <span className="priv">Privado</span>
    </header>
  )
  if (q.isPending) return <main className="app-main">{header}<p className="muted">A carregar…</p></main>
  if (q.isError) {
    const code = toAppError(q.error).code
    return (
      <main className="app-main">{header}
        <div className="notice notice-error" role="alert">
          {code === 'NOT_AUTHORIZED' ? 'Esta área é só para quem acompanha o negócio.' : 'Não foi possível mostrar custos e stock.'}
        </div>
        <button className="btn btn-secondary" onClick={back}>Voltar</button>
      </main>
    )
  }

  const c = q.data
  const s = c.summary
  const fromHealth = health.data && health.data.current.period.id === c.period.id
    ? buildInsights(health.data, m).insights.filter((i) => i.kind === 'expense_category_high') : []
  const insights = sortInsights([...fromHealth, ...costInsights(c, m).insights])
  const prev = c.comparison.previous, avg = c.comparison.average_3

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

      <section className="stack" aria-labelledby="custos-resumo">
        <h3 id="custos-resumo" className="label">Neste período</h3>
        <dl className="kv-card" data-testid="costs-summary">
          <div><dt>Despesas</dt><dd className="num">{m(s.expenses_minor)}{s.expenses_pct_of_production !== null && <span className="muted"> · {pctText(s.expenses_pct_of_production)} da produção</span>}</dd></div>
          <div><dt>Compras (parte do salão)</dt><dd className="num">{s.purchases_salon_minor === null ? HIDDEN : m(s.purchases_salon_minor)}{s.purchases_pct_of_production !== null && <span className="muted"> · {pctText(s.purchases_pct_of_production)} da produção</span>}</dd></div>
          <div><dt>Produtos a precisar de atenção</dt><dd className="num">{s.products_attention}</dd></div>
        </dl>
      </section>

      {insights.length > 0 && (
        <section className="stack" aria-label="Atenção">
          {insights.map((i) => <InsightCard key={i.id} insight={i} finance={ctx.view === 'manager'} />)}
        </section>
      )}

      <section className="stack" aria-labelledby="despesas">
        <h3 id="despesas" className="label">Despesas</h3>
        {!prev.available ? <p className="muted" style={{ margin: 0 }} data-testid="costs-comparison-unavailable">{COMPARISON_UNAVAILABLE[prev.reason ?? 'no_previous_period']}</p>
          : !avg.available && <p className="muted" style={{ margin: 0 }} data-testid="costs-average-unavailable">{COMPARISON_UNAVAILABLE[avg.reason ?? 'insufficient_history']}</p>}
        {c.expenses.length === 0 ? <p className="muted" style={{ margin: 0 }}>Sem despesas registadas.</p> : (
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {c.expenses.map((x) => <CategoryCard key={x.category_id} x={x} m={m} prev={prev.period?.label} />)}
          </ul>
        )}
      </section>

      <section className="stack" aria-labelledby="compras" data-testid="purchases">
        <h3 id="compras" className="label">Compras</h3>
        {c.purchases.salon_minor === null
          ? <span className="num" data-testid="purchases-private">Suportado pelo salão: {HIDDEN}<span className="muted" style={{ display: 'block', fontSize: '0.875rem' }}>{HIDDEN_WHY_CONTRIBUTION}</span></span>
          : <span className="num">{m(c.purchases.salon_minor)} suportados pelo salão{c.purchases.change && c.purchases.change.delta_minor !== null && <span className="muted"> · {changeText(c.purchases.change, m)} face a {prev.period?.label}</span>}
              {c.purchases.previous_private && <span className="muted"> · sem comparação: o período anterior não é mostrado</span>}</span>}
        {c.purchases.products.length === 0 ? <p className="muted" style={{ margin: 0 }}>Sem compras registadas neste período.</p> : (
          <dl className="kv-card">
            {c.purchases.products.slice(0, 5).map((x) => (
              <div key={x.product_id}><dt>{x.name}</dt>
                <dd className="num">{x.salon_minor === null ? HIDDEN : m(x.salon_minor)}<span className="muted"> · {x.purchases_count} {x.purchases_count === 1 ? 'compra' : 'compras'} · última {day(x.last_purchased_at)}</span></dd></div>
            ))}
          </dl>
        )}
        <span className="muted" style={{ fontSize: '0.875rem' }}>Só conta a parte paga pelo salão.</span>
      </section>

      <section className="stack" aria-labelledby="stock" data-testid="stock">
        <h3 id="stock" className="label">Stock</h3>
        <span className="num">Agora: {c.stock.comprar} comprar · {c.stock.baixo} baixo · {c.stock.urgent} urgente · {c.stock.on_list} na lista</span>
        {c.stock.attention.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
            {c.stock.attention.map((x) => <li key={x.product_id}>{x.name} · {STOCK_LABEL[x.state]}{x.urgent ? ' · urgente' : ''}</li>)}
          </ul>
        )}
        {c.stock.activity.length > 0 && (
          <>
            <span className="muted" style={{ fontSize: '0.875rem' }}>Nos últimos {c.stock.window.days} dias:</span>
            <dl className="kv-card" data-testid="stock-activity">
              {c.stock.activity.slice(0, 5).map((x) => (
                <div key={x.product_id}><dt>{x.name}</dt><dd className="num">{x.purchases} {x.purchases === 1 ? 'compra' : 'compras'} · {x.marks} {x.marks === 1 ? 'marcação' : 'marcações'}</dd></div>
              ))}
            </dl>
          </>
        )}
        <span className="muted" style={{ fontSize: '0.875rem' }}>O stock é o estado que a equipa marca; o sistema não conta unidades nem mede consumo.</span>
      </section>
    </main>
  )
}

function changeText(ch: Change, m: (n: number) => string) {
  if (ch.delta_minor === null) return '—'
  return ch.percent === null ? `${ch.delta_minor > 0 ? '+' : ''}${m(ch.delta_minor)}` : signed(ch.percent)
}

function CategoryCard({ x, m, prev }: { x: CostCategory; m: (n: number) => string; prev?: string }) {
  const lines = [x.change_previous && `Face a ${prev}: ${changeText(x.change_previous, m)}`,
                 x.change_average_3 && `face à média de 3: ${changeText(x.change_average_3, m)}`].filter(Boolean).join(' · ')
  return (
    <li className="stack" style={{ gap: '0.5rem' }} data-testid="category">
      <strong>{x.label}</strong>
      <div aria-hidden style={{ height: 6, borderRadius: 3, background: 'var(--line)' }}>
        <div style={{ width: `${Math.min(100, x.share_of_expenses_pct ?? 0)}%`, height: '100%', borderRadius: 3, background: 'var(--muted)' }} />
      </div>
      <dl className="kv-card">
        <div><dt>Valor</dt><dd className="num">{m(x.current_minor)}</dd></div>
        <div><dt>Parte das despesas</dt><dd className="num">{x.share_of_expenses_pct === null ? '—' : pctText(x.share_of_expenses_pct)}</dd></div>
        <div><dt>Parte da produção</dt><dd className="num">{x.share_of_production_pct === null ? '—' : pctText(x.share_of_production_pct)}</dd></div>
      </dl>
      {lines && <span className="muted num" style={{ fontSize: '0.875rem' }} data-testid="category-change">{lines}</span>}
    </li>
  )
}
