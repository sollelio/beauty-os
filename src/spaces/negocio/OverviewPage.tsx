// Negócio → Visão geral (Business Health Slice 01), private area, business.health.read. Every figure comes from the
// business_health read model (the Fecho calculation, ADR-0004); insights come from the business domain layer. This
// screen only arranges, words and links them. No person's figures appear here; for a viewer without team.finance.read
// a team-derived figure that would resolve to one other person arrives hidden (private_fields, 07 D9 · B11): it is
// said to be hidden, never shown as zero, "—" or not approved.
// On the mobile shell (UX slice 8): summary → what needs attention → what changed → the areas → recent periods. The
// private bar: for a business-only holder this is the private area's root (× exits); a manager came from Equipa.
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { usePrivateContext } from '../../modules/org/privateContext'
import { businessKeys, getBusinessHealth, getBusinessCosts, getBusinessServices, getBusinessTeam, listBusinessPeriods, type BusinessHealth, type Change, type PrivateField } from '../../modules/business/api'
import { buildInsights, costDrivers, COMPARISON_UNAVAILABLE } from '../../modules/business/insights'
import { INSIGHT_THRESHOLDS } from '../../modules/business/thresholds'
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

const pctText = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${String(Math.abs(n)).replace('.', ',')}%`

export function OverviewPage() {
  const org = useOrganization()
  const ctx = usePrivateContext()
  const navigate = useNavigate()
  const { p } = useNegocioPeriod()
  const manager = ctx.view === 'manager'
  const back = useAppBack('/privado/equipa')
  const health = useQuery({ queryKey: businessKeys.health(p), queryFn: () => getBusinessHealth(p) })
  const periods = useQuery({ queryKey: businessKeys.periods, queryFn: listBusinessPeriods })
  const team = useQuery({ queryKey: businessKeys.team(p), queryFn: () => getBusinessTeam(p) })   // team concentration insight
  const services = useQuery({ queryKey: businessKeys.services(p), queryFn: () => getBusinessServices(p) })   // service insights
  const costs = useQuery({ queryKey: businessKeys.costs(p), queryFn: () => getBusinessCosts(p) })   // purchase and product insights
  useLostContext([health.error, periods.error])
  const m = (n: number) => formatMoney(n, org)
  // a manager reached Negócio from Equipa; for a business-only holder this is the area's root, and × leaves it
  const bar = <PrivateBar title="Negócio" root={!manager} onBack={back} />

  if (!health.data) return <NegocioState bar={bar} error={health.error} what="a visão do negócio" onBack={back} />
  const h = health.data
  const c = h.current
  const { insights } = buildInsights(h, m, INSIGHT_THRESHOLDS, team.data, services.data, costs.data)
  const pending = c.pending_rules_count > 0
  const hidden = (k: PrivateField) => c.private_fields.includes(k)
  const to = (path: string) => navigate(`${path}?p=${c.period.id}`)

  return (
    <AppScreen bar={bar}>
      <PeriodContext period={c.period} periods={periods.data} />

      <section className="stack" aria-labelledby="como-estamos">
        <SectionHead id="como-estamos">Como estamos?</SectionHead>
        <ValueList lead testId="overview" rows={[
          ['Produção', <>{m(c.production_minor)}<span className="muted"> · {c.services_count} serviços</span></>],
          ['Resultado operacional', <>{hidden('operating_result_minor') ? HIDDEN : c.operating_result_minor === null ? '—' : m(c.operating_result_minor)}
            {c.operating_costs_minor !== null && <span className="muted"> · custos {m(c.operating_costs_minor)}</span>}</>],
          ['Livre', hidden('free_minor') ? HIDDEN : c.free_minor === null ? '—' : m(c.free_minor)],
          ['A pagar à equipa', hidden('unpaid_team_minor') ? HIDDEN : c.unpaid_team_minor === null ? 'Ainda não aprovado' : m(c.unpaid_team_minor)],
        ]} />
        <p className="note support" data-testid="retention">
          <strong className="num">Retenção operacional {hidden('retention_pct') ? HIDDEN : c.retention_pct === null ? '—' : pctText(c.retention_pct).replace('+', '')}</strong>
          {' · '}{hidden('retention_pct') ? hiddenWhy(c.private_fields) : c.retention_pct === null ? (c.production_minor === 0 ? 'Sem produção neste período.' : 'Por calcular enquanto houver regras por definir.')
            : 'da produção ficou como resultado operacional.'}
        </p>
        {c.private_fields.length > 0 && <span className="support" data-testid="team-private">{hiddenWhy(c.private_fields)}</span>}
        {pending && <div className="notice notice-neutral">Há {c.pending_rules_count === 1 ? '1 regra' : `${c.pending_rules_count} regras`} de remuneração por definir: os custos, o resultado e o livre ficam por calcular até lá.</div>}
        {c.source === 'close_statement' && <span className="support">Valores do fecho deste período.</span>}
      </section>

      <section className="stack" aria-labelledby="atencao">
        <SectionHead id="atencao">Precisa da tua atenção</SectionHead>
        {insights.length === 0 ? <EmptyState icon="check" title="Nada a assinalar neste período." />
          : <InsightList insights={insights} finance={manager} />}
        <ListGroup>
          <ListRow as="button" onClick={() => to('/privado/negocio/insights')} title="Ver todos os insights" chevron />
        </ListGroup>
      </section>

      <Changes h={h} m={m} />

      <section className="stack" aria-labelledby="areas">
        <SectionHead id="areas">Em detalhe</SectionHead>
        <ListGroup>
          <ListRow as="button" onClick={() => to('/privado/negocio/equipa')} leading={<RowIcon name="person" tone="quiet" />} title="Equipa" chevron />
          <ListRow as="button" onClick={() => to('/privado/negocio/servicos')} leading={<RowIcon name="receipt" tone="quiet" />} title="Serviços" chevron />
          <ListRow as="button" onClick={() => to('/privado/negocio/custos')} leading={<RowIcon name="box" tone="quiet" />} title="Custos & Stock" chevron />
          <ListRow as="button" onClick={() => to('/privado/negocio/financas')} leading={<RowIcon name="chart" tone="quiet" />} title="Finanças" chevron />
          {manager && <ListRow as="button" onClick={() => to('/privado/fecho')} leading={<RowIcon name="calendarCheck" tone="quiet" />} title="Fecho do período" chevron />}
        </ListGroup>
      </section>

      {h.trend.length > 1 && (
        <section className="stack" aria-labelledby="tendencia">
          <SectionHead id="tendencia">Últimos períodos</SectionHead>
          <ValueList testId="trend" rows={h.trend.map((t) => [
            `${t.label}${t.is_complete ? '' : ' (a decorrer)'}`,
            <>{m(t.production_minor)}<span className="muted"> · resultado {t.result_private ? HIDDEN.toLowerCase() : t.operating_result_minor === null ? '—' : m(t.operating_result_minor)}</span></>,
          ])} />
        </section>
      )}
    </AppScreen>
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
      <SectionHead id="mudou">O que mudou?</SectionHead>
      {h.changes.previous ? (
        <p className="note num" style={{ color: 'var(--ink)' }}>Face a {prev.period?.label}: {changeLine('produção', h.changes.previous.production_minor, m)} · {changeLine('resultado', h.changes.previous.operating_result_minor, m, resPrev)}.</p>
      ) : <p className="note">{COMPARISON_UNAVAILABLE[prev.reason ?? 'no_previous_period']}</p>}
      {h.changes.average_3 ? (
        <p className="note num" style={{ color: 'var(--ink)' }}>Face à média dos últimos {avg.window} períodos fechados: {changeLine('produção', h.changes.average_3.production_minor, m)} · {changeLine('resultado', h.changes.average_3.operating_result_minor, m, resAvg)}.</p>
      ) : avg.reason !== prev.reason && <p className="note">{COMPARISON_UNAVAILABLE[avg.reason ?? 'insufficient_history']}</p>}
      {drivers.length > 0 && (
        <>
          <span className="support">Custos que mais subiram face a {prev.period?.label}:</span>
          <ListGroup>{drivers.map((d) => <ListRow key={d.label} title={<span className="num">{d.label} {d.text}</span>} />)}</ListGroup>
        </>
      )}
    </section>
  )
}
