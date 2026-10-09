// Negócio → Equipa (Business Health Slice 02), private area, business.health.read. How the team's work makes up the
// period's production: services, production, average ticket and share per professional, and their change against
// the previous comparable period — all from the business_team read model; the concentration insight comes from the
// business domain layer. Not a ranking and not payroll: no positions, no "best"/"worst", and no remuneration (that
// is the person's situation, offered only to team.finance.read holders). A viewer without team.finance.read gets the
// team as a whole only — the read model sends no named rows (07 D9 · B11).
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { clearPrivateData, usePrivateContext } from '../../modules/org/privateContext'
import { businessKeys, getBusinessTeam, listBusinessPeriods, type BusinessTeam, type TeamMember } from '../../modules/business/api'
import { COMPARISON_UNAVAILABLE, concentration, teamConcentration } from '../../modules/business/insights'
import { STATE_LABEL } from '../../modules/period/api'
import { toAppError } from '../../shared/errors'
import { formatMoney } from '../../shared/money'
import { formatDayShort } from '../../shared/time'
import { InsightCard } from './InsightCard'

const pctText = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')}%`
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${String(Math.abs(n)).replace('.', ',')}%`

export function TeamPage() {
  const org = useOrganization()
  const ctx = usePrivateContext()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [sp, setSp] = useSearchParams()
  const p = sp.get('p')
  const team = useQuery({ queryKey: businessKeys.team(p), queryFn: () => getBusinessTeam(p) })
  const periods = useQuery({ queryKey: businessKeys.periods, queryFn: listBusinessPeriods })
  const lost = [team.error, periods.error].some((e) => e && toAppError(e).code === 'VERIFICATION_REQUIRED')
  useEffect(() => { if (lost) clearPrivateData(qc) }, [lost, qc])
  const m = (n: number) => formatMoney(n, org)
  const back = () => navigate(p ? `/privado/negocio?p=${p}` : '/privado/negocio')

  const header = (
    <header className="flow-header-row">
      <button className="icon-btn" aria-label="Voltar" onClick={back}>←</button>
      <span className="muted" style={{ fontWeight: 600 }}>Negócio · Equipa</span>
      <span className="priv">Privado</span>
    </header>
  )
  if (team.isPending) return <main className="app-main">{header}<p className="muted">A carregar…</p></main>
  if (team.isError) {
    const code = toAppError(team.error).code
    return (
      <main className="app-main">{header}
        <div className="notice notice-error" role="alert">
          {code === 'NOT_AUTHORIZED' ? 'Esta área é só para quem acompanha o negócio.' : 'Não foi possível mostrar a equipa.'}
        </div>
        <button className="btn btn-secondary" onClick={back}>Voltar</button>
      </main>
    )
  }

  const t = team.data
  const s = t.summary
  const conc = concentration(t)
  const { insight } = teamConcentration(t)

  return (
    <main className="app-main">
      {header}

      <section className="stack" style={{ gap: '0.5rem' }} data-testid="period-context">
        <h2 style={{ margin: 0 }}>{t.period.label}</h2>
        <span className="muted">
          {formatDayShort(t.period.starts_on, org.timezone)} – {formatDayShort(t.period.ends_on, org.timezone)} · {STATE_LABEL[t.period.state]}
          {t.period.is_complete ? '' : ' · a decorrer'}
        </span>
        {periods.data && periods.data.length > 1 && (
          <label className="field">
            <select aria-label="Período" value={t.period.id} onChange={(e) => setSp({ p: e.target.value }, { replace: true })}>
              {periods.data.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
        )}
      </section>

      <section className="stack" aria-labelledby="equipa-resumo">
        <h3 id="equipa-resumo" className="label">A equipa neste período</h3>
        <dl className="kv-card" data-testid="team-summary">
          <div><dt>Produção</dt><dd className="num">{m(s.production_minor)}</dd></div>
          <div><dt>Serviços</dt><dd className="num">{s.services_count}</dd></div>
          <div><dt>Ticket médio</dt><dd className="num">{s.average_ticket_minor === null ? '—' : m(s.average_ticket_minor)}</dd></div>
          <div><dt>Profissionais com serviços</dt><dd className="num">{s.active_count}</dd></div>
          <div><dt>Concentração</dt><dd className="num">{conc === null ? '—'
            : s.active_count === 1 ? 'Toda a produção num profissional' : `Maior contributo ${pctText(conc.top)} · dois maiores ${pctText(conc.topTwo)}`}</dd></div>
        </dl>
      </section>

      {insight && <section className="stack" aria-label="Atenção"><InsightCard insight={insight} finance={ctx.view === 'manager'} /></section>}

      <section className="stack" aria-labelledby="profissionais">
        <h3 id="profissionais" className="label">Profissionais</h3>
        {t.people === null ? <p className="muted" style={{ margin: 0 }} data-testid="team-aggregate-only">
            O detalhe por profissional é só para quem acompanha as finanças da equipa: com a produção de cada pessoa, os valores da equipa permitiriam calcular quanto cada uma ganha.</p>
        : t.people.length === 0 ? <p className="muted" style={{ margin: 0 }}>Sem serviços registados neste período.</p> : (
          <>
            {!t.comparison.available && <p className="muted" style={{ margin: 0 }} data-testid="team-comparison-unavailable">
              {COMPARISON_UNAVAILABLE[t.comparison.reason ?? 'no_previous_period']}</p>}
            <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {t.people.map((x) => <MemberCard key={x.person_id} x={x} t={t} m={m} finance={ctx.view === 'manager'} />)}
            </ul>
          </>
        )}
        {t.people !== null && t.people.length > 0 && <span className="muted" style={{ fontSize: '0.875rem' }}>Ordenado pela produção do período. Mostra como a produção se distribui; não avalia ninguém.</span>}
      </section>
    </main>
  )
}

function MemberCard({ x, t, m, finance }: { x: TeamMember; t: BusinessTeam; m: (n: number) => string; finance: boolean }) {
  const navigate = useNavigate()
  const prev = t.comparison.period?.label
  let change: string | null = null
  if (x.change && x.change.delta_minor !== null) {
    const d = `${x.change.delta_minor > 0 ? '+' : ''}${m(x.change.delta_minor)}`
    change = x.previous_production_minor === 0 ? `Sem produção em ${prev}` : `Face a ${prev}: ${x.change.percent === null ? d : `${signed(x.change.percent)} (${d})`}`
  }
  return (
    <li className="stack" style={{ gap: '0.5rem' }} data-testid="member">
      <strong>{x.display_name}</strong>
      <dl className="kv-card">
        <div><dt>Produção</dt><dd className="num">{m(x.production_minor)}</dd></div>
        <div><dt>Serviços</dt><dd className="num">{x.services_count}</dd></div>
        <div><dt>Ticket médio</dt><dd className="num">{m(x.average_ticket_minor)}</dd></div>
        <div><dt>Parte da produção</dt><dd className="num">{x.share_pct === null ? '—' : pctText(x.share_pct)}</dd></div>
      </dl>
      {change && <span className="muted num" style={{ fontSize: '0.875rem' }} data-testid="member-change">{change}</span>}
      {finance && <button className="btn btn-secondary" onClick={() => navigate(`/privado/situacao/${x.person_id}?p=${t.period.id}`)}>Ver situação completa</button>}
    </li>
  )
}
