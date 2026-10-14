// Negócio → Insights (Business Health Slice 06), private area, business.health.read. "What deserves my attention, why,
// and what can I do next?" Every insight comes from the one engine (modules/business/insights) over the same
// privacy-redacted reads as the other Negócio pages: a figure hidden there (07 D9 · B11) is never an input here. Open
// situations are read as of now; the analysis follows the selected period. Nothing is stored: a resolved situation
// simply disappears (no resolution history in V1).
// On the mobile shell (UX slice 8): the counts and a severity filter (chips), then the open situations and the
// period analysis as insight rows (each opens its explanation in a sheet), and the recent periods as chips.
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { usePrivateContext } from '../../modules/org/privateContext'
import { businessKeys, getBusinessCosts, getBusinessHealth, getBusinessServices, getBusinessTeam, listBusinessPeriods } from '../../modules/business/api'
import { buildInsightHub, COMPARISON_UNAVAILABLE, SEVERITY_LABEL, SEVERITY_ORDER, type Insight, type Severity } from '../../modules/business/insights'
import { formatMoney } from '../../shared/money'
import { AppScreen } from '../../shared/ui/AppShell'
import { useAppBack } from '../../shared/ui/navigation'
import { EmptyState } from '../../shared/ui/states'
import { PrivateBar } from '../privado/PrivateBar'
import { InsightList } from './InsightCard'
import { hiddenWhy } from './hidden'
import { NegocioState, PeriodContext, SectionHead, ValueList } from './shell'
import { useLostContext, useNegocioPeriod } from './useNegocio'

type Filter = 'all' | Severity

export function InsightsPage() {
  const org = useOrganization()
  const ctx = usePrivateContext()
  const [, setSp] = useSearchParams()
  const { p, overview } = useNegocioPeriod()
  const back = useAppBack(overview)
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
  useLostContext([health.error, nowHealth.error, periods.error])
  const m = (n: number) => formatMoney(n, org)
  const bar = <PrivateBar title="Negócio · Insights" onBack={back} />
  if (!health.data || !nowHealth.data) return <NegocioState bar={bar} error={health.error ?? nowHealth.error} what="os insights" onBack={back} />

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
    <AppScreen bar={bar}>
      <PeriodContext period={c.period} periods={periods.data} />

      <section className="stack" aria-label="Resumo">
        <ValueList testId="severity-counts" rows={SEVERITY_ORDER.map((s) => [SEVERITY_LABEL[s], hub.counts[s]])} />
        <div className="filter-chips" role="group" aria-label="Filtrar">
          {(['all', ...SEVERITY_ORDER] as Filter[]).map((f) => (
            <button key={f} type="button" className="chip chip-outline" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Todos' : SEVERITY_LABEL[f]}
            </button>
          ))}
        </div>
      </section>

      <section className="stack" aria-labelledby="agora" data-testid="active">
        <SectionHead id="agora">Por resolver agora</SectionHead>
        {active.length === 0 ? <EmptyState icon="check" title={hub.active.length === 0 ? 'Nada por resolver.' : 'Nada com este filtro.'} />
          : <InsightList insights={active} finance={finance} hub />}
        {now.open_periods.some((x) => x.unpaid_private) && <span className="support" data-testid="active-private">{hiddenWhy(['unpaid_team_minor'])}</span>}
        <span className="support">Situações em aberto hoje{isNow ? '' : `, seja qual for o período escolhido`}; desaparecem quando ficam resolvidas.</span>
      </section>

      <section className="stack" aria-labelledby="analise" data-testid="analysis">
        <SectionHead id="analise">Em {c.period.label}</SectionHead>
        {analysis.length === 0 ? <EmptyState icon="check" title={hub.period.length === 0 ? 'Nada a assinalar neste período.' : 'Nada com este filtro.'} />
          : <InsightList insights={analysis} finance={finance} hub />}
        {!prevMeta.available && <span className="support" data-testid="insufficient">Sem comparação com o período anterior: {COMPARISON_UNAVAILABLE[prevMeta.reason ?? 'no_previous_period']}</span>}
        {c.private_fields.length > 0 && <span className="support" data-testid="analysis-private">{hiddenWhy(c.private_fields)} Nenhum insight usa esses valores.</span>}
      </section>

      {h.trend.length > 1 && (
        <section className="stack" aria-labelledby="historico">
          <SectionHead id="historico">Períodos recentes</SectionHead>
          <div className="filter-chips" role="group" aria-label="Períodos recentes" data-testid="history">
            {[...h.trend].reverse().map((t) => (
              <button key={t.id} type="button" className="chip chip-outline" aria-pressed={t.id === c.period.id}
                onClick={() => setSp({ p: t.id }, { replace: true })}>{t.label}</button>
            ))}
          </div>
        </section>
      )}

      {total === 0 && <p className="note support" data-testid="none">Os insights aparecem quando há dados suficientes; sem dados suficientes não há conclusões.</p>}
    </AppScreen>
  )
}
