// Negócio → Finanças (Business Health Slice 05), private area, business.health.read. How healthy the business is
// financially, what changed, what puts pressure on the result. Every figure, comparison, indicator, driver and trend
// point comes from business_finance (the Fecho position through business_health, ADR-0004); this screen only arranges
// and words them. A figure that would resolve to one person's money arrives hidden (07 D9 · B11) and is said to be
// hidden. Not an accounting statement: the product's own terms, no "lucro".
// On the mobile shell (UX slice 8): summary → what needs attention → how the money is distributed → what changed →
// evolution → reserve → decisions and obligations. Value groups only; no chart, bar or score.
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { usePrivateContext } from '../../modules/org/privateContext'
import { businessKeys, getBusinessCosts, getBusinessFinance, getBusinessHealth, listBusinessPeriods,
         type BusinessFinance, type Change, type FinanceDriver, type FinanceMetric, type FinanceMetricKey } from '../../modules/business/api'
import { generateInsights, COMPARISON_UNAVAILABLE, type InsightKind } from '../../modules/business/insights'
import { INSIGHT_THRESHOLDS } from '../../modules/business/thresholds'
import { STATE_LABEL } from '../../modules/period/api'
import { formatMoney } from '../../shared/money'
import { AppScreen } from '../../shared/ui/AppShell'
import { ListGroup, ListRow, RowIcon } from '../../shared/ui/ListRow'
import { useAppBack } from '../../shared/ui/navigation'
import { EmptyState } from '../../shared/ui/states'
import { PrivateBar } from '../privado/PrivateBar'
import { InsightList } from './InsightCard'
import { HIDDEN, hiddenWhy } from './hidden'
import { NegocioState, PeriodContext, SectionHead, ValueList } from './shell'
import { useLostContext, useNegocioPeriod } from './useNegocio'

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
  const { p, overview } = useNegocioPeriod()
  const back = useAppBack(overview)
  const q = useQuery({ queryKey: businessKeys.finance(p), queryFn: () => getBusinessFinance(p) })
  const health = useQuery({ queryKey: businessKeys.health(p), queryFn: () => getBusinessHealth(p) })   // insights 1–5
  const costs = useQuery({ queryKey: businessKeys.costs(p), queryFn: () => getBusinessCosts(p) })     // insight 10
  const periods = useQuery({ queryKey: businessKeys.periods, queryFn: listBusinessPeriods })
  useLostContext([q.error, health.error, periods.error])
  const m = (n: number) => formatMoney(n, org)
  const manager = ctx.view === 'manager'
  const bar = <PrivateBar title="Negócio · Finanças" onBack={back} />
  if (!q.data) return <NegocioState bar={bar} error={q.error} what="as finanças do negócio" onBack={back} />

  const f = q.data
  const v = (k: FinanceMetricKey) => f.metrics.find((x) => x.key === k)!
  const shown = (x: FinanceMetric) => x.hidden ? HIDDEN : x.current === null ? '—' : m(x.current)
  const o = f.obligations
  const h = health.data && health.data.current.period.id === f.period.id ? health.data : undefined
  const c = costs.data && costs.data.period.id === f.period.id ? costs.data : undefined
  const insights = h ? generateInsights(h, m, INSIGHT_THRESHOLDS, undefined, undefined, c).insights.filter((i) => FINANCE_INSIGHTS.includes(i.kind)) : []
  const pending = f.pending_rules_count > 0
  const why = f.private_fields.length > 0 ? hiddenWhy(f.private_fields) : null

  return (
    <AppScreen bar={bar}>
      <PeriodContext period={f.period} periods={periods.data} />

      <section className="stack" aria-labelledby="fin-resumo">
        <SectionHead id="fin-resumo">Resumo financeiro</SectionHead>
        <ValueList lead testId="finance-summary" rows={[
          ['Produção', shown(v('production_minor'))],
          ['Resultado operacional', shown(v('operating_result_minor'))],
          ['Livre', shown(v('free_minor'))],
          ['A pagar à equipa', o.unpaid_team_minor === null ? (f.private_fields.includes('unpaid_team_minor') ? HIDDEN : 'Ainda não aprovado') : m(o.unpaid_team_minor)],
        ]} />
        {why && <span className="support" data-testid="finance-private">{why}</span>}
        {pending && <div className="notice notice-neutral">Há {f.pending_rules_count === 1 ? '1 regra' : `${f.pending_rules_count} regras`} de remuneração por definir: os ganhos da equipa, os custos, o resultado e o livre ficam por calcular até lá.</div>}
        {f.source === 'close_statement' && <span className="support">Valores do fecho deste período.</span>}
      </section>

      <section className="stack" aria-labelledby="fin-atencao">
        <SectionHead id="fin-atencao">Precisa da tua atenção</SectionHead>
        {insights.length === 0 ? <EmptyState icon="check" title="Nada a assinalar nas finanças deste período." />
          : <InsightList insights={insights} finance={manager} />}
      </section>

      <section className="stack" aria-labelledby="fin-distribui" data-testid="composition">
        <SectionHead id="fin-distribui">Como o dinheiro se distribui</SectionHead>
        <ValueList rows={[
          ['Produção', shown(v('production_minor'))],
          ['− Ganhos da equipa', shown(v('team_earnings_minor'))],
          ['− Despesas', shown(v('expenses_minor'))],
          ['− Compras (parte do salão)', shown(v('purchases_salon_minor'))],
          [<strong>= Resultado operacional</strong>, <strong>{shown(v('operating_result_minor'))}</strong>],
        ]} />
        <Indicators f={f} sym={org.currency_symbol} />
        <span className="support">Não é uma demonstração contabilística: é o dinheiro do período tal como o fecho o calcula.</span>
      </section>

      <Changes f={f} m={m} />

      <Trend f={f} m={m} />

      <section className="stack" aria-labelledby="fin-reserva" data-testid="reserve">
        <SectionHead id="fin-reserva">Reserva</SectionHead>
        <ValueList rows={[
          ['Saldo atual', m(f.reserve.balance_minor)],
          ['Alocado neste período', <>{m(f.reserve.allocated_minor)}{f.reserve.previous_allocated_minor !== null && <span className="muted"> · antes {m(f.reserve.previous_allocated_minor)}</span>}</>],
          ['Usado neste período', <>{m(f.reserve.used_minor)}{f.reserve.previous_used_minor !== null && <span className="muted"> · antes {m(f.reserve.previous_used_minor)}</span>}</>],
        ]} />
        <span className="support">Dinheiro guardado pelo negócio. O livre já desconta o que foi alocado e soma o que foi pago pela reserva.</span>
      </section>

      <section className="stack" aria-labelledby="fin-decisoes" data-testid="obligations">
        <SectionHead id="fin-decisoes">Decisões e obrigações</SectionHead>
        <ValueList rows={[
          ['Estado do período', STATE_LABEL[o.state]],
          ['Decisão dos sócios', o.owners_decision === null ? 'Por registar' : o.owners_decision === 'none' ? 'Registada · sem distribuição' : 'Registada'],
          ['Não distribuído', f.private_fields.includes('undistributed_minor') ? HIDDEN : o.undistributed_minor === null ? '—' : m(o.undistributed_minor)],
          ['Pago à equipa', f.private_fields.includes('paid_team_minor') ? HIDDEN : o.paid_team_minor === null ? 'Ainda não aprovado' : m(o.paid_team_minor)],
          ['A pagar à equipa', f.private_fields.includes('unpaid_team_minor') ? HIDDEN : o.unpaid_team_minor === null ? 'Ainda não aprovado' : m(o.unpaid_team_minor)],
        ]} />
        {manager && (
          <ListGroup>
            <ListRow as="button" onClick={() => navigate(`/privado/fecho?p=${f.period.id}`)} leading={<RowIcon name="calendarCheck" tone="quiet" />} title="Fecho do período" chevron />
            {o.approved && <ListRow as="button" onClick={() => navigate(`/privado/fecho/pagamentos?p=${f.period.id}`)} leading={<RowIcon name="card" tone="quiet" />} title="Pagamentos" chevron />}
          </ListGroup>
        )}
      </section>
    </AppScreen>
  )
}

function Indicators({ f, sym }: { f: BusinessFinance; sym: string }) {
  const i = f.indicators
  const prod = f.metrics.find((x) => x.key === 'production_minor')!.current
  if (prod === 0) return <span className="support" data-testid="indicators">Sem produção neste período: sem rácios.</span>
  if (i.retention_pct === null && i.operating_cost_ratio_pct === null) {
    return <span className="support" data-testid="indicators">{f.private_fields.includes('retention_pct') ? `Retenção e peso dos custos: ${HIDDEN.toLowerCase()}.` : 'Retenção e peso dos custos por calcular.'}</span>
  }
  return (
    <div className="stack stack-tight" data-testid="indicators">
      {i.operating_cost_ratio_pct !== null && <span className="num">Custos operacionais: <strong>{dec(i.operating_cost_ratio_pct)}%</strong> da produção.</span>}
      {i.retention_pct !== null && <span className="num">Retenção operacional: <strong>{i.retention_pct < 0 ? '−' : ''}{dec(i.retention_pct)}%</strong>
        {i.retention_change_previous_pp !== null && <span className="muted"> · {pp(i.retention_change_previous_pp)} face a {f.comparison.previous.period?.label}</span>}
        {i.retention_change_average_3_pp !== null && <span className="muted"> · {pp(i.retention_change_average_3_pp)} face à média</span>}</span>}
      {i.retention_pct !== null && (
        <span className="support" data-testid="retention-sentence">
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
      <SectionHead id="fin-mudou">O que mudou?</SectionHead>
      {!prev.available ? <p className="note">{COMPARISON_UNAVAILABLE[prev.reason ?? 'no_previous_period']}</p> : (
        <>
          {rc && rc.delta_minor !== null && (
            <p className="note" style={{ color: 'var(--ink)', fontWeight: 600 }} data-testid="result-headline">
              Resultado operacional {rc.delta_minor < 0 ? 'caiu' : rc.delta_minor > 0 ? 'subiu' : 'manteve-se'}{rc.percent !== null && rc.delta_minor !== 0 ? ` ${dec(rc.percent)}%` : ''} face a {prev.period?.label}.
            </p>
          )}
          {f.drivers.length > 0 && (
            <div className="stack" data-testid="drivers">
              <span className="support">Principais movimentos nos custos (coincidem com a variação; não indicam a causa):</span>
              <ul className="row-group plain-list">
                {f.drivers.map((d) => <li key={d.kind + (d.label ?? '')} className="row num">{driverLabel(d)} {changeText(d, m)}</li>)}
              </ul>
            </div>
          )}
          <ValueList testId="comparison-table" rows={rows.map((x) => [LABEL[x.key],
            <>{x.hidden || x.previous_hidden ? HIDDEN : x.change_previous ? changeText(x.change_previous, m) : '—'}
              {x.previous !== null && <span className="muted"> · antes {m(x.previous)}</span>}
              {x.change_average_3 && <span className="muted"> · média {m(x.average_3!)}: {changeText(x.change_average_3, m)}</span>}</>])} />
        </>
      )}
      {prev.available && !avg.available && <p className="note">{COMPARISON_UNAVAILABLE[avg.reason ?? 'insufficient_history']}</p>}
    </section>
  )
}

function Trend({ f, m }: { f: BusinessFinance; m: (n: number) => string }) {
  if (f.trend.length < 2) return null
  return (
    <section className="stack" aria-labelledby="fin-evolucao">
      <SectionHead id="fin-evolucao">Evolução</SectionHead>
      <ListGroup data-testid="finance-trend">
        {f.trend.map((t) => {
          const hidden = t.private_fields.includes('operating_result_minor')
          return (
            <div key={t.id} className="row-line" data-testid="trend-point">
              <ListRow title={<>{t.label}{t.is_complete ? '' : <span className="muted"> (a decorrer)</span>}</>}
                subtitle={<span className="num">produção {m(t.production_minor)} · resultado {hidden ? HIDDEN.toLowerCase() : t.operating_result_minor === null ? '—' : m(t.operating_result_minor)}
                  {' · '}retenção {t.private_fields.includes('retention_pct') ? HIDDEN.toLowerCase() : t.retention_pct === null ? '—' : `${t.retention_pct < 0 ? '−' : ''}${dec(t.retention_pct)}%`}</span>} />
            </div>
          )
        })}
      </ListGroup>
    </section>
  )
}
