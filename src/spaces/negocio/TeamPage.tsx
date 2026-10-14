// Negócio → Equipa (Business Health Slice 02), private area, business.health.read. How the team's work makes up the
// period's production: services, production, average ticket and share per professional, and their change against
// the previous comparable period — all from the business_team read model; the concentration insight comes from the
// business domain layer. Not a ranking and not payroll: no positions, no "best"/"worst", and no remuneration (that
// is the person's situation, offered only to team.finance.read holders). A viewer without team.finance.read gets the
// team as a whole only — the read model sends no named rows (07 D9 · B11).
// On the mobile shell (UX slice 8): the team summary, the concentration insight, then — for a team-finance holder
// only — one whole row per professional (production on the right; tapping opens their situation, as before).
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { usePrivateContext } from '../../modules/org/privateContext'
import { businessKeys, getBusinessTeam, listBusinessPeriods, type BusinessTeam, type TeamMember } from '../../modules/business/api'
import { COMPARISON_UNAVAILABLE, concentration, teamConcentration } from '../../modules/business/insights'
import { formatMoney } from '../../shared/money'
import { AppScreen } from '../../shared/ui/AppShell'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack } from '../../shared/ui/navigation'
import { EmptyState } from '../../shared/ui/states'
import { PrivateBar } from '../privado/PrivateBar'
import { InsightList } from './InsightCard'
import { NegocioState, PeriodContext, SectionHead, ValueList } from './shell'
import { useLostContext, useNegocioPeriod } from './useNegocio'

const pctText = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')}%`
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${String(Math.abs(n)).replace('.', ',')}%`

export function TeamPage() {
  const org = useOrganization()
  const ctx = usePrivateContext()
  const { p, overview } = useNegocioPeriod()
  const back = useAppBack(overview)
  const team = useQuery({ queryKey: businessKeys.team(p), queryFn: () => getBusinessTeam(p) })
  const periods = useQuery({ queryKey: businessKeys.periods, queryFn: listBusinessPeriods })
  useLostContext([team.error, periods.error])
  const m = (n: number) => formatMoney(n, org)
  const bar = <PrivateBar title="Negócio · Equipa" onBack={back} />
  if (!team.data) return <NegocioState bar={bar} error={team.error} what="a equipa" onBack={back} />

  const t = team.data
  const s = t.summary
  const conc = concentration(t)
  const { insight } = teamConcentration(t)
  const finance = ctx.view === 'manager'

  return (
    <AppScreen bar={bar}>
      <PeriodContext period={t.period} periods={periods.data} />

      <section className="stack" aria-labelledby="equipa-resumo">
        <SectionHead id="equipa-resumo">A equipa neste período</SectionHead>
        <ValueList lead testId="team-summary" rows={[
          ['Produção', m(s.production_minor)],
          ['Serviços', s.services_count],
          ['Ticket médio', s.average_ticket_minor === null ? '—' : m(s.average_ticket_minor)],
          ['Profissionais com serviços', s.active_count],
          ['Concentração', conc === null ? '—' : s.active_count === 1 ? 'Toda a produção num profissional' : `Maior contributo ${pctText(conc.top)} · dois maiores ${pctText(conc.topTwo)}`],
        ]} />
      </section>

      {insight && <section className="stack" aria-label="Atenção"><InsightList insights={[insight]} finance={finance} /></section>}

      <section className="stack" aria-labelledby="profissionais">
        <SectionHead id="profissionais">Profissionais</SectionHead>
        {t.people === null ? <p className="note support" data-testid="team-aggregate-only">
            O detalhe por profissional é só para quem acompanha as finanças da equipa: com a produção de cada pessoa, os valores da equipa permitiriam calcular quanto cada uma ganha.</p>
        : t.people.length === 0 ? <EmptyState icon="person" title="Sem serviços registados neste período." /> : (
          <>
            {!t.comparison.available && <p className="note support" data-testid="team-comparison-unavailable">
              {COMPARISON_UNAVAILABLE[t.comparison.reason ?? 'no_previous_period']}</p>}
            <ListGroup>
              {t.people.map((x) => <MemberRow key={x.person_id} x={x} t={t} m={m} finance={finance} />)}
            </ListGroup>
          </>
        )}
        {t.people !== null && t.people.length > 0 && <span className="support">Ordenado pela produção do período. Mostra como a produção se distribui; não avalia ninguém.</span>}
      </section>
    </AppScreen>
  )
}

function MemberRow({ x, t, m, finance }: { x: TeamMember; t: BusinessTeam; m: (n: number) => string; finance: boolean }) {
  const navigate = useNavigate()
  const prev = t.comparison.period?.label
  let change: string | null = null
  if (x.change && x.change.delta_minor !== null) {
    const d = `${x.change.delta_minor > 0 ? '+' : ''}${m(x.change.delta_minor)}`
    change = x.previous_production_minor === 0 ? `Sem produção em ${prev}` : `Face a ${prev}: ${x.change.percent === null ? d : `${signed(x.change.percent)} (${d})`}`
  }
  const slots = {
    title: <strong>{x.display_name}</strong>,
    subtitle: <span className="stack stack-tight num">
      <span>{x.services_count} serviços · ticket médio {m(x.average_ticket_minor)} · {x.share_pct === null ? '—' : pctText(x.share_pct)} da produção</span>
      {change && <span data-testid="member-change">{change}</span>}
    </span>,
    trailing: <span className="row-value num">{m(x.production_minor)}</span>,
  }
  return (
    <div className="row-line" data-testid="member">
      {finance
        ? <ListRow as="button" onClick={() => navigate(`/privado/situacao/${x.person_id}?p=${t.period.id}`)} chevron {...slots} />
        : <ListRow {...slots} />}
    </div>
  )
}
