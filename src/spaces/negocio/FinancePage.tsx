// Negócio → Finanças (Business Health Slice 05), private area, business.health.read. How healthy the business is
// financially, what changed, what puts pressure on the result. Every figure, comparison, indicator, driver and trend
// point comes from business_finance (the Fecho position through business_health, ADR-0004); this screen only arranges
// and words them. A figure that would resolve to one person's money arrives hidden (07 D9 · B11) and is said to be
// hidden. Not an accounting statement: the product's own terms, no "lucro".
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { clearPrivateData, usePrivateContext } from '../../modules/org/privateContext'
import { businessKeys, getBusinessCosts, getBusinessFinance, getBusinessHealth, listBusinessPeriods,
         type BusinessFinance, type Change, type FinanceDriver, type FinanceMetric, type FinanceMetricKey } from '../../modules/business/api'
import { buildInsights, COMPARISON_UNAVAILABLE, type InsightKind } from '../../modules/business/insights'
import { INSIGHT_THRESHOLDS } from '../../modules/business/thresholds'
import { STATE_LABEL } from '../../modules/period/api'
import { toAppError } from '../../shared/errors'
import { formatMoney } from '../../shared/money'
import { formatDayShort } from '../../shared/time'
import { InsightCard } from './InsightCard'
import { HIDDEN, hiddenWhy } from './hidden'

/** The V1 insights that belong to the money picture (Slices 01 and 04); shown here in their financial context. */
const FINANCE_INSIGHTS: InsightKind[] = ['payments_pending', 'period_blocked', 'production_up_result_down', 'production_decline',
                                               'expense_category_high', 'purchases_up']
const LABEL: Record<FinanceMetricKey, string> = {
  production_minor: 'Produção', team_earnings_minor: 'Ganhos da equipa', expenses_minor: 'Despesas',
  purchases_salon_minor: 'Compras (parte do salão)', operating_costs_minor: 'Custos operacionais',
  operating_result_minor: 'Resultado operacional', free_minor: 'Livre',
}
const dec = (n: number) => String(Math.abs(n)).replace('.', ',')
const signedPct = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${dec(n)}%`
const pp = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${dec(n)} p.p.`

export function FinancePage() {
  const org = useOrganization()
  const ctx = usePrivateContext()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [sp, setSp] = useSearchParams()
  const p = sp.get('p')
  const q = useQuery({ queryKey: businessKeys.finance(p), queryFn: () => getBusinessFinance(p) })
  const health = useQuery({ queryKey: businessKeys.health(p), queryFn: () => getBusinessHealth(p) })   // insights 1–5
  const costs = useQuery({ queryKey: businessKeys.costs(p), queryFn: () => getBusinessCosts(p) })     // insight 10
  const periods = useQuery({ queryKey: businessKeys.periods, queryFn: listBusinessPeriods })
  const lost = [q.error, health.error, periods.error].some((e) => e && toAppError(e).code === 'VERIFICATION_REQUIRED')
  useEffect(() => { if (lost) clearPrivateData(qc) }, [lost, qc])
  const m = (n: number) => formatMoney(n, org)
  const back = () => navigate(p ? `/privado/negocio?p=${p}` : '/privado/negocio')
  const manager = ctx.view === 'manager'

  const header = (
    <header className="flow-header-row">
      <button className="icon-btn" aria-label="Voltar" onClick={back}>←</button>
      <span className="muted" style={{ fontWeight: 600 }}>Negócio · Finanças</span>
      <span className="priv">Privado</span>
    </header>
  )
  if (q.isPending) return <main className="app-main">{header}<p className="muted">A carregar…</p></main>
  if (q.isError) {
    const code = toAppError(q.error).code
    return (
      <main className="app-main">{header}
        <div className="notice notice-error" role="alert">
          {code === 'NOT_AUTHORIZED' ? 'Esta área é só para quem acompanha o negócio.' : 'Não foi possível mostrar as finanças do negócio.'}
        </div>
        <button className="btn btn-secondary" onClick={back}>Voltar</button>
      </main>
    )
  }

  const f = q.data
  const v = (k: FinanceMetricKey) => f.metrics.find((x) => x.key === k)!
  const shown = (x: FinanceMetric) => x.hidden ? HIDDEN : x.current === null ? '—' : m(x.current)
  const o = f.obligations
  const h = health.data && health.data.current.period.id === f.period.id ? health.data : undefined
  const c = costs.data && costs.data.period.id === f.period.id ? costs.data : undefined
  const insights = h ? buildInsights(h, m, INSIGHT_THRESHOLDS, undefined, undefined, c).insights.filter((i) => FINANCE_INSIGHTS.includes(i.kind)) : []
  const pending = f.pending_rules_count > 0
  const why = f.private_fields.length > 0 ? hiddenWhy(f.private_fields) : null

  return (
    <main className="app-main">
      {header}

      <section className="stack" style={{ gap: '0.5rem' }} data-testid="period-context">
        <h2 style={{ margin: 0 }}>{f.period.label}</h2>
        <span className="muted">
          {formatDayShort(f.period.starts_on, org.timezone)} – {formatDayShort(f.period.ends_on, org.timezone)} · {STATE_LABEL[f.period.state]}
          {f.period.is_complete ? '' : ' · a decorrer'}
        </span>
        {periods.data && periods.data.length > 1 && (
          <label className="field">
            <select aria-label="Período" value={f.period.id} onChange={(e) => setSp({ p: e.target.value }, { replace: true })}>
              {periods.data.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
        )}
      </section>

      <section className="stack" aria-labelledby="fin-resumo">
        <h3 id="fin-resumo" className="label">Resumo financeiro</h3>
        <dl className="kv-card" data-testid="finance-summary">
          <div><dt>Produção</dt><dd className="num">{shown(v('production_minor'))}</dd></div>
          <div><dt>Resultado operacional</dt><dd className="num">{shown(v('operating_result_minor'))}</dd></div>
          <div><dt>Livre</dt><dd className="num">{shown(v('free_minor'))}</dd></div>
          <div><dt>A pagar à equipa</dt><dd className="num">{o.unpaid_team_minor === null ? (f.private_fields.includes('unpaid_team_minor') ? HIDDEN : 'Ainda não aprovado') : m(o.unpaid_team_minor)}</dd></div>
        </dl>
        {why && <span className="muted" style={{ fontSize: '0.875rem' }} data-testid="finance-private">{why}</span>}
        {pending && <div className="notice notice-neutral">Há {f.pending_rules_count === 1 ? '1 regra' : `${f.pending_rules_count} regras`} de remuneração por definir: os ganhos da equipa, os custos, o resultado e o livre ficam por calcular até lá.</div>}
        {f.source === 'close_statement' && <span className="muted" style={{ fontSize: '0.875rem' }}>Valores do fecho deste período.</span>}
      </section>

      <section className="stack" aria-labelledby="fin-distribui" data-testid="composition">
        <h3 id="fin-distribui" className="label">Como o dinheiro se distribui</h3>
        <dl className="kv-card">
          <div><dt>Produção</dt><dd className="num">{shown(v('production_minor'))}</dd></div>
          <div><dt>− Ganhos da equipa</dt><dd className="num">{shown(v('team_earnings_minor'))}</dd></div>
          <div><dt>− Despesas</dt><dd className="num">{shown(v('expenses_minor'))}</dd></div>
          <div><dt>− Compras (parte do salão)</dt><dd className="num">{shown(v('purchases_salon_minor'))}</dd></div>
          <div><dt><strong>= Resultado operacional</strong></dt><dd className="num"><strong>{shown(v('operating_result_minor'))}</strong></dd></div>
        </dl>
        <Indicators f={f} sym={org.currency_symbol} />
        <span className="muted" style={{ fontSize: '0.875rem' }}>Não é uma demonstração contabilística: é o dinheiro do período tal como o fecho o calcula.</span>
      </section>

      <Changes f={f} m={m} />

      <Trend f={f} m={m} />

      <section className="stack" aria-labelledby="fin-reserva" data-testid="reserve">
        <h3 id="fin-reserva" className="label">Reserva</h3>
        <dl className="kv-card">
          <div><dt>Saldo atual</dt><dd className="num">{m(f.reserve.balance_minor)}</dd></div>
          <div><dt>Alocado neste período</dt><dd className="num">{m(f.reserve.allocated_minor)}{f.reserve.previous_allocated_minor !== null && <span className="muted"> · antes {m(f.reserve.previous_allocated_minor)}</span>}</dd></div>
          <div><dt>Usado neste período</dt><dd className="num">{m(f.reserve.used_minor)}{f.reserve.previous_used_minor !== null && <span className="muted"> · antes {m(f.reserve.previous_used_minor)}</span>}</dd></div>
        </dl>
        <span className="muted" style={{ fontSize: '0.875rem' }}>Dinheiro guardado pelo negócio. O livre já desconta o que foi alocado e soma o que foi pago pela reserva.</span>
      </section>

      <section className="stack" aria-labelledby="fin-decisoes" data-testid="obligations">
        <h3 id="fin-decisoes" className="label">Decisões e obrigações</h3>
        <dl className="kv-card">
          <div><dt>Estado do período</dt><dd>{STATE_LABEL[o.state]}</dd></div>
          <div><dt>Decisão dos sócios</dt><dd>{o.owners_decision === null ? 'Por registar' : o.owners_decision === 'none' ? 'Registada · sem distribuição' : 'Registada'}</dd></div>
          <div><dt>Não distribuído</dt><dd className="num">{f.private_fields.includes('undistributed_minor') ? HIDDEN : o.undistributed_minor === null ? '—' : m(o.undistributed_minor)}</dd></div>
          <div><dt>Pago à equipa</dt><dd className="num">{f.private_fields.includes('paid_team_minor') ? HIDDEN : o.paid_team_minor === null ? 'Ainda não aprovado' : m(o.paid_team_minor)}</dd></div>
          <div><dt>A pagar à equipa</dt><dd className="num">{f.private_fields.includes('unpaid_team_minor') ? HIDDEN : o.unpaid_team_minor === null ? 'Ainda não aprovado' : m(o.unpaid_team_minor)}</dd></div>
        </dl>
        {manager && <button className="pick" onClick={() => navigate(`/privado/fecho?p=${f.period.id}`)}><strong>Fecho do período</strong><span aria-hidden className="muted">›</span></button>}
        {manager && o.approved && <button className="pick" onClick={() => navigate(`/privado/fecho/pagamentos?p=${f.period.id}`)}><strong>Pagamentos</strong><span aria-hidden className="muted">›</span></button>}
      </section>

      <section className="stack" aria-labelledby="fin-atencao">
        <h3 id="fin-atencao" className="label">Precisa da tua atenção</h3>
        {insights.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nada a assinalar nas finanças deste período.</p>
          : insights.map((i) => <InsightCard key={i.id} insight={i} finance={manager} />)}
      </section>
    </main>
  )
}

function Indicators({ f, sym }: { f: BusinessFinance; sym: string }) {
  const i = f.indicators
  const prod = f.metrics.find((x) => x.key === 'production_minor')!.current
  if (prod === 0) return <span className="muted" data-testid="indicators">Sem produção neste período: sem rácios.</span>
  if (i.retention_pct === null && i.operating_cost_ratio_pct === null) {
    return <span className="muted" data-testid="indicators">{f.private_fields.includes('retention_pct') ? `Retenção e peso dos custos: ${HIDDEN.toLowerCase()}.` : 'Retenção e peso dos custos por calcular.'}</span>
  }
  return (
    <div className="stack" style={{ gap: '0.25rem' }} data-testid="indicators">
      {i.operating_cost_ratio_pct !== null && <span className="num">Custos operacionais: <strong>{dec(i.operating_cost_ratio_pct)}%</strong> da produção.</span>}
      {i.retention_pct !== null && <span className="num">Retenção operacional: <strong>{i.retention_pct < 0 ? '−' : ''}{dec(i.retention_pct)}%</strong>
        {i.retention_change_previous_pp !== null && <span className="muted"> · {pp(i.retention_change_previous_pp)} face a {f.comparison.previous.period?.label}</span>}
        {i.retention_change_average_3_pp !== null && <span className="muted"> · {pp(i.retention_change_average_3_pp)} face à média</span>}</span>}
      {i.retention_pct !== null && (
        <span className="muted" style={{ fontSize: '0.875rem' }} data-testid="retention-sentence">
          {i.retention_pct >= 0
            ? `De cada 100 ${sym} produzidos, ${dec(i.retention_pct)} ${sym} ficaram como resultado operacional, antes das decisões de reserva e distribuição.`
            : `Os custos operacionais passaram a produção: por cada 100 ${sym} produzidos, faltaram ${dec(i.retention_pct)} ${sym}.`}
        </span>
      )}
    </div>
  )
}

function changeText(ch: Change, m: (n: number) => string) {
  if (ch.delta_minor === null) return '—'
  const delta = `${ch.delta_minor > 0 ? '+' : ''}${m(ch.delta_minor)}`
  return ch.percent === null ? delta : `${signedPct(ch.percent)} (${delta})`
}

const driverLabel = (d: FinanceDriver) => d.kind === 'team_earnings' ? 'Ganhos da equipa' : d.kind === 'purchases_salon' ? 'Compras (parte do salão)' : d.label!

function Changes({ f, m }: { f: BusinessFinance; m: (n: number) => string }) {
  const prev = f.comparison.previous, avg = f.comparison.average_3
  const rows = f.metrics.filter((x) => x.key !== 'operating_costs_minor')
  const rc = f.result_change
  return (
    <section className="stack" aria-labelledby="fin-mudou" data-testid="finance-changes">
      <h3 id="fin-mudou" className="label">O que mudou?</h3>
      {!prev.available ? <p className="muted" style={{ margin: 0 }}>{COMPARISON_UNAVAILABLE[prev.reason ?? 'no_previous_period']}</p> : (
        <>
          {rc && rc.delta_minor !== null && (
            <p style={{ margin: 0 }} data-testid="result-headline">
              Resultado operacional {rc.delta_minor < 0 ? 'caiu' : rc.delta_minor > 0 ? 'subiu' : 'manteve-se'}{rc.percent !== null && rc.delta_minor !== 0 ? ` ${dec(rc.percent)}%` : ''} face a {prev.period?.label}.
            </p>
          )}
          {f.drivers.length > 0 && (
            <div className="stack" style={{ gap: '0.25rem' }} data-testid="drivers">
              <span className="muted" style={{ fontSize: '0.875rem' }}>Principais movimentos nos custos (coincidem com a variação; não indicam a causa):</span>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {f.drivers.map((d) => <li key={d.kind + (d.label ?? '')} className="num">{driverLabel(d)} {changeText(d, m)}</li>)}
              </ul>
            </div>
          )}
          <dl className="kv-card" data-testid="comparison-table">
            {rows.map((x) => (
              <div key={x.key}><dt>{LABEL[x.key]}</dt>
                <dd className="num">{x.hidden || x.previous_hidden ? HIDDEN : x.change_previous ? changeText(x.change_previous, m) : '—'}
                  {x.previous !== null && <span className="muted"> · antes {m(x.previous)}</span>}
                  {x.change_average_3 && <span className="muted"> · média {m(x.average_3!)}: {changeText(x.change_average_3, m)}</span>}</dd></div>
            ))}
          </dl>
        </>
      )}
      {prev.available && !avg.available && <p className="muted" style={{ margin: 0 }}>{COMPARISON_UNAVAILABLE[avg.reason ?? 'insufficient_history']}</p>}
    </section>
  )
}

function Trend({ f, m }: { f: BusinessFinance; m: (n: number) => string }) {
  if (f.trend.length < 2) return null
  const max = Math.max(...f.trend.map((t) => t.production_minor), 1)
  return (
    <section className="stack" aria-labelledby="fin-evolucao">
      <h3 id="fin-evolucao" className="label">Evolução</h3>
      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: '0.75rem' }} data-testid="finance-trend">
        {f.trend.map((t) => {
          const hidden = t.private_fields.includes('operating_result_minor')
          return (
            <li key={t.id} className="stack" style={{ gap: '0.25rem' }} data-testid="trend-point">
              <span><strong>{t.label}</strong>{t.is_complete ? '' : <span className="muted"> (a decorrer)</span>}</span>
              <div aria-hidden style={{ height: 6, borderRadius: 3, background: 'var(--line)' }}>
                <div style={{ width: `${Math.round(t.production_minor * 100 / max)}%`, height: '100%', borderRadius: 3, background: 'var(--muted)' }} />
              </div>
              <span className="num muted" style={{ fontSize: '0.875rem' }}>
                produção {m(t.production_minor)} · resultado {hidden ? HIDDEN.toLowerCase() : t.operating_result_minor === null ? '—' : m(t.operating_result_minor)}
                {' · '}retenção {t.private_fields.includes('retention_pct') ? HIDDEN.toLowerCase() : t.retention_pct === null ? '—' : `${t.retention_pct < 0 ? '−' : ''}${dec(t.retention_pct)}%`}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
