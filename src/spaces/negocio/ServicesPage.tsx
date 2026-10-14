// Negócio → Serviços (Business Health Slice 03), private area, business.health.read. What customers buy, what
// generates value and how demand moves: per service (never per person) from the business_services read model; the
// service insights come from the business domain layer. Neutral order (revenue, count), no "best"/"worst", and no
// claim about marketing, campaigns or why demand moved. A service with a single performer arrives inside "Outros
// serviços" for a viewer without team.finance.read (07 D9 · B11).
// On the mobile shell (UX slice 8): the summary, the service insights, the two short top lists, then one row per
// service (revenue on the right; count, ticket and share below) and the grouped services — no bars, no ranking marks.
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { usePrivateContext } from '../../modules/org/privateContext'
import { businessKeys, getBusinessServices, listBusinessPeriods, type BusinessServices, type ServiceRow } from '../../modules/business/api'
import { COMPARISON_UNAVAILABLE, serviceInsights } from '../../modules/business/insights'
import { formatMoney } from '../../shared/money'
import { AppScreen } from '../../shared/ui/AppShell'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack } from '../../shared/ui/navigation'
import { EmptyState } from '../../shared/ui/states'
import { PrivateBar } from '../privado/PrivateBar'
import { InsightList } from './InsightCard'
import { NegocioState, PeriodContext, SectionHead, ValueList } from './shell'
import { useLostContext, useNegocioPeriod } from './useNegocio'

const pctText = (n: number) => `${String(n).replace('.', ',')}%`
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${String(Math.abs(n)).replace('.', ',')}%`
const TOP = 3

export function ServicesPage() {
  const org = useOrganization()
  const ctx = usePrivateContext()
  const { p, overview } = useNegocioPeriod()
  const back = useAppBack(overview)
  const q = useQuery({ queryKey: businessKeys.services(p), queryFn: () => getBusinessServices(p) })
  const periods = useQuery({ queryKey: businessKeys.periods, queryFn: listBusinessPeriods })
  useLostContext([q.error, periods.error])
  const m = (n: number) => formatMoney(n, org)
  const bar = <PrivateBar title="Negócio · Serviços" onBack={back} />
  if (!q.data) return <NegocioState bar={bar} error={q.error} what="os serviços" onBack={back} />

  const s = q.data
  const sum = s.summary
  const { insights } = serviceInsights(s, m)
  const byCount = [...s.services].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const prev = s.comparison.previous, before = s.comparison.before_previous

  return (
    <AppScreen bar={bar}>
      <PeriodContext period={s.period} periods={periods.data} />

      <section className="stack" aria-labelledby="servicos-resumo">
        <SectionHead id="servicos-resumo">Neste período</SectionHead>
        <ValueList lead testId="services-summary" rows={[
          ['Produção', m(sum.production_minor)],
          ['Serviços realizados', sum.services_count],
          ['Ticket médio', sum.average_ticket_minor === null ? '—' : m(sum.average_ticket_minor)],
          ['Serviços diferentes', sum.distinct_services],
        ]} />
      </section>

      {insights.length > 0 && (
        <section className="stack" aria-label="Atenção"><InsightList insights={insights} finance={ctx.view === 'manager'} /></section>
      )}

      {s.services.length === 0 && !s.other ? <EmptyState icon="receipt" title="Sem serviços registados neste período." /> : (
        <>
          <section className="stack" aria-labelledby="mais-receita" data-testid="top-revenue">
            <SectionHead id="mais-receita">Mais receita</SectionHead>
            <ListGroup>
              {s.services.slice(0, TOP).map((x) => <ListRow key={x.service_id} title={x.name} trailing={<span className="row-value num">{m(x.revenue_minor)}</span>} />)}
            </ListGroup>
          </section>
          <section className="stack" aria-labelledby="mais-realizados" data-testid="top-count">
            <SectionHead id="mais-realizados">Mais realizados</SectionHead>
            <ListGroup>
              {byCount.slice(0, TOP).map((x) => <ListRow key={x.service_id} title={x.name} trailing={<span className="row-value num">{x.count}</span>} />)}
            </ListGroup>
          </section>

          <section className="stack" aria-labelledby="distribuicao">
            <SectionHead id="distribuicao">Distribuição da produção</SectionHead>
            {!prev.available ? <p className="note support" data-testid="services-comparison-unavailable">{COMPARISON_UNAVAILABLE[prev.reason ?? 'no_previous_period']}</p>
              : !before.available && <p className="note support" data-testid="services-trend-unavailable">
                  Crescimento ou queda precisam de três períodos comparáveis: ainda há só dois.</p>}
            <ListGroup>
              {s.services.map((x) => <ServiceItem key={x.service_id} x={x} s={s} m={m} />)}
              {s.other && (
                <div className="row-line" data-testid="services-other">
                  <ListRow title={<strong>Outros serviços ({s.other.services})</strong>}
                    subtitle={<span className="stack stack-tight"><span className="num">{s.other.count} realizados</span>
                      <span>Juntos, porque sozinhos mostrariam a produção de uma só pessoa.</span></span>}
                    trailing={<span className="row-value num">{m(s.other.revenue_minor)}</span>} />
                </div>
              )}
            </ListGroup>
            <span className="support">Ordenado pela receita do período. Valores registados, não preços de tabela.</span>
          </section>
        </>
      )}
    </AppScreen>
  )
}

function ServiceItem({ x, s, m }: { x: ServiceRow; s: BusinessServices; m: (n: number) => string }) {
  const prev = s.comparison.previous.period?.label
  let change: string | null = null
  if (x.change && x.previous) {
    const c = x.change.count, r = x.change.revenue
    change = x.previous.count === 0 ? `Sem registos em ${prev}`
      : `Face a ${prev}: ${c.percent === null ? `${(c.delta_minor ?? 0) > 0 ? '+' : ''}${c.delta_minor}` : signed(c.percent)} em quantidade · ${r.percent === null ? m(r.delta_minor ?? 0) : signed(r.percent)} em receita`
  }
  return (
    <div className="row-line" data-testid="service">
      <ListRow title={<strong>{x.name}</strong>}
        subtitle={<span className="stack stack-tight num">
          <span>{x.count} realizados · ticket médio {m(x.average_ticket_minor)} · {x.share_pct === null ? '—' : pctText(x.share_pct)} da produção</span>
          {change && <span data-testid="service-change">{change}</span>}
        </span>}
        trailing={<span className="row-value num">{m(x.revenue_minor)}</span>} />
    </div>
  )
}
