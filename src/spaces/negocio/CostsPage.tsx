// Negócio → Custos & Stock (Business Health Slice 04), private area, business.health.read. Where the money goes, what
// changed and which products keep coming back: expense categories and salon-funded purchases from business_costs
// (whose period figures and references are business_health's own), Stock Lite as people set it. Insights come from
// the business domain layer. No person, no contribution, no stock quantities or consumption (Stock Lite has none).
// On the mobile shell (UX slice 8): the summary, the cost insights, one row per expense category, the salon-funded
// purchases, and Stock as the team marked it (the same states and tones as Stock; nothing inferred here).
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { usePrivateContext } from '../../modules/org/privateContext'
import { businessKeys, getBusinessCosts, getBusinessHealth, listBusinessPeriods, type Change, type CostCategory } from '../../modules/business/api'
import { generateInsights, COMPARISON_UNAVAILABLE, costInsights, sortInsights } from '../../modules/business/insights'
import { formatMoney } from '../../shared/money'
import { formatDayShort } from '../../shared/time'
import { AppScreen } from '../../shared/ui/AppShell'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack } from '../../shared/ui/navigation'
import { StatusChip } from '../../shared/ui/StatusChip'
import { EmptyState } from '../../shared/ui/states'
import { PrivateBar } from '../privado/PrivateBar'
import { InsightList } from './InsightCard'
import { HIDDEN, HIDDEN_WHY_CONTRIBUTION } from './hidden'
import { NegocioState, PeriodContext, SectionHead, ValueList } from './shell'
import { useLostContext, useNegocioPeriod } from './useNegocio'

const pctText = (n: number) => `${String(n).replace('.', ',')}%`
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${String(Math.abs(n)).replace('.', ',')}%`
const STOCK_LABEL = { ok: 'OK', baixo: 'Baixo', comprar: 'Comprar' } as const
const STOCK_TONE = { ok: 'success', baixo: 'caution', comprar: 'warning' } as const   // as Stock shows them

export function CostsPage() {
  const org = useOrganization()
  const ctx = usePrivateContext()
  const { p, overview } = useNegocioPeriod()
  const back = useAppBack(overview)
  const q = useQuery({ queryKey: businessKeys.costs(p), queryFn: () => getBusinessCosts(p) })
  const health = useQuery({ queryKey: businessKeys.health(p), queryFn: () => getBusinessHealth(p) })   // insight 5
  const periods = useQuery({ queryKey: businessKeys.periods, queryFn: listBusinessPeriods })
  useLostContext([q.error, health.error, periods.error])
  const m = (n: number) => formatMoney(n, org)
  const day = (iso: string) => formatDayShort(iso.slice(0, 10), org.timezone)
  const bar = <PrivateBar title="Negócio · Custos & Stock" onBack={back} />
  if (!q.data) return <NegocioState bar={bar} error={q.error} what="custos e stock" onBack={back} />

  const c = q.data
  const s = c.summary
  const fromHealth = health.data && health.data.current.period.id === c.period.id
    ? generateInsights(health.data, m).insights.filter((i) => i.kind === 'expense_category_high') : []
  const insights = sortInsights([...fromHealth, ...costInsights(c, m).insights])
  const prev = c.comparison.previous, avg = c.comparison.average_3

  return (
    <AppScreen bar={bar}>
      <PeriodContext period={c.period} periods={periods.data} />

      <section className="stack" aria-labelledby="custos-resumo">
        <SectionHead id="custos-resumo">Neste período</SectionHead>
        <ValueList lead testId="costs-summary" rows={[
          ['Despesas', <>{m(s.expenses_minor)}{s.expenses_pct_of_production !== null && <span className="muted"> · {pctText(s.expenses_pct_of_production)} da produção</span>}</>],
          ['Compras (parte do salão)', <>{s.purchases_salon_minor === null ? HIDDEN : m(s.purchases_salon_minor)}{s.purchases_pct_of_production !== null && <span className="muted"> · {pctText(s.purchases_pct_of_production)} da produção</span>}</>],
          ['Produtos a precisar de atenção', s.products_attention],
        ]} />
      </section>

      {insights.length > 0 && (
        <section className="stack" aria-label="Atenção"><InsightList insights={insights} finance={ctx.view === 'manager'} /></section>
      )}

      <section className="stack" aria-labelledby="despesas">
        <SectionHead id="despesas">Despesas</SectionHead>
        {!prev.available ? <p className="note support" data-testid="costs-comparison-unavailable">{COMPARISON_UNAVAILABLE[prev.reason ?? 'no_previous_period']}</p>
          : !avg.available && <p className="note support" data-testid="costs-average-unavailable">{COMPARISON_UNAVAILABLE[avg.reason ?? 'insufficient_history']}</p>}
        {c.expenses.length === 0 ? <EmptyState icon="receipt" title="Sem despesas registadas." /> : (
          <ListGroup>{c.expenses.map((x) => <CategoryRow key={x.category_id} x={x} m={m} prev={prev.period?.label} />)}</ListGroup>
        )}
      </section>

      <section className="stack" aria-labelledby="compras" data-testid="purchases">
        <SectionHead id="compras">Compras</SectionHead>
        {c.purchases.salon_minor === null
          ? <p className="note num" data-testid="purchases-private"><strong>Suportado pelo salão: {HIDDEN}</strong><span className="support" style={{ display: 'block' }}>{HIDDEN_WHY_CONTRIBUTION}</span></p>
          : <p className="note num" style={{ color: 'var(--ink)' }}><strong>{m(c.purchases.salon_minor)} suportados pelo salão</strong>{c.purchases.change && c.purchases.change.delta_minor !== null && <span className="muted"> · {changeText(c.purchases.change, m)} face a {prev.period?.label}</span>}
              {c.purchases.previous_private && <span className="muted"> · sem comparação: o período anterior não é mostrado</span>}</p>}
        {c.purchases.products.length === 0 ? <EmptyState icon="box" title="Sem compras registadas neste período." /> : (
          <ValueList rows={c.purchases.products.slice(0, 5).map((x) => [x.name,
            <>{x.salon_minor === null ? HIDDEN : m(x.salon_minor)}<span className="muted"> · {x.purchases_count} {x.purchases_count === 1 ? 'compra' : 'compras'} · última {day(x.last_purchased_at)}</span></>])} />
        )}
        <span className="support">Só conta a parte paga pelo salão.</span>
      </section>

      <section className="stack" aria-labelledby="stock" data-testid="stock">
        <SectionHead id="stock">Stock</SectionHead>
        <p className="note num" style={{ color: 'var(--ink)' }}>Agora: {c.stock.comprar} comprar · {c.stock.baixo} baixo · {c.stock.urgent} urgente · {c.stock.on_list} na lista</p>
        {c.stock.attention.length > 0 && (
          <ListGroup role="group" aria-label="Produtos marcados">
            {c.stock.attention.map((x) => (
              <ListRow key={x.product_id} leading={x.urgent ? <span aria-hidden className="urgent-dot" /> : undefined} title={x.name}
                subtitle={x.urgent ? 'urgente' : undefined} trailing={<StatusChip tone={STOCK_TONE[x.state]}>{STOCK_LABEL[x.state]}</StatusChip>} />
            ))}
          </ListGroup>
        )}
        {c.stock.activity.length > 0 && (
          <>
            <span className="support">Nos últimos {c.stock.window.days} dias:</span>
            <ValueList testId="stock-activity" rows={c.stock.activity.slice(0, 5).map((x) => [x.name,
              `${x.purchases} ${x.purchases === 1 ? 'compra' : 'compras'} · ${x.marks} ${x.marks === 1 ? 'marcação' : 'marcações'}`])} />
          </>
        )}
        <span className="support">O stock é o estado que a equipa marca; o sistema não conta unidades nem mede consumo.</span>
      </section>
    </AppScreen>
  )
}

function changeText(ch: Change, m: (n: number) => string) {
  if (ch.delta_minor === null) return '—'
  return ch.percent === null ? `${ch.delta_minor > 0 ? '+' : ''}${m(ch.delta_minor)}` : signed(ch.percent)
}

function CategoryRow({ x, m, prev }: { x: CostCategory; m: (n: number) => string; prev?: string }) {
  const lines = [x.change_previous && `Face a ${prev}: ${changeText(x.change_previous, m)}`,
                 x.change_average_3 && `face à média de 3: ${changeText(x.change_average_3, m)}`].filter(Boolean).join(' · ')
  return (
    <div className="row-line" data-testid="category">
      <ListRow title={<strong>{x.label}</strong>}
        subtitle={<span className="stack stack-tight num">
          <span>{x.share_of_expenses_pct === null ? '—' : pctText(x.share_of_expenses_pct)} das despesas · {x.share_of_production_pct === null ? '—' : pctText(x.share_of_production_pct)} da produção</span>
          {lines && <span data-testid="category-change">{lines}</span>}
        </span>}
        trailing={<span className="row-value num">{m(x.current_minor)}</span>} />
    </div>
  )
}
