// Aprovar valores (Slice 06 F10): one boundary for the whole period, with each person's derivation, the cases it
// acknowledges and what stays apart. Submits the reviewed revision (ADR-0005 R-3).
import { useNavigate } from 'react-router'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { approvePeriod } from '../../modules/period/api'
import { formatAmount, formatMoney } from '../../shared/money'
import { useFecho } from './fecho'
import { Boundary, FechoHeader, Loading } from './ui'

export function ApprovePage() {
  const org = useOrganization()
  const navigate = useNavigate()
  const { q, to } = useFecho()
  if (!q.data) return <Loading q={q} />
  const f = q.data, pos = f.position
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const back = () => navigate(to('/privado/fecho'))
  const over = pos.people.filter((x) => (x.excess_minor ?? 0) > 0)
  const contributors = pos.people.filter((x) => x.contributions.count > 0)
  const ownerUndecided = pos.owners_decision === null && pos.people.some((x) => x.is_owner && x.rule.kind === 'contextual')

  if (!f.readiness.can_approve) {
    return (
      <main className="app-main">
        <FechoHeader title="Aprovar valores" back={back} />
        <div className="notice notice-warning" role="status">
          {f.period.state !== 'aberto' ? 'Este período já não está aberto para aprovação.'
            : `Defina as regras de ${pos.pending.map((x) => x.display_name).join(' e ')} para aprovar.`}
        </div>
        <button className="btn btn-secondary" onClick={back}>Voltar ao Fecho</button>
      </main>
    )
  }
  return (
    <main className="app-main">
      <FechoHeader title="Aprovar valores" back={back} />
      <Boundary permission="period.decide" run={approvePeriod} input={{ periodId: f.period.id, revision: f.review_revision }}
        intro="Só uma pessoa autorizada aprova os valores a pagar." label={`Aprovar ${m(pos.payable_minor)}`} onSuccess={back} onBack={back}
        lockNote="Fica no histórico com quem aprovou e quando. O período passa a «Pronto para pagamento»; depois, os valores só mudam com registo de quem e porquê.">
        <section className="stack" style={{ gap: 0 }} data-testid="approval-lines">
          {pos.people.map((x) => (
            <div key={x.person_id} className="list-row">
              <span className="grow"><strong style={{ display: 'block' }}>{x.display_name}</strong>
                <span className="muted num" style={{ fontSize: '0.8125rem' }}>
                  {(x.excess_minor ?? 0) > 0 ? `nada a pagar · adiantamentos ${g(x.advances.total_minor)} acima do ganho ${g(x.earned_minor ?? 0)}`
                    : `= ganho ${g(x.earned_minor ?? 0)} − adiantamentos ${g(x.advances.total_minor)}${x.payments.count ? ` − pagos ${g(x.payments.total_minor)}` : ''}`}</span></span>
              <span className="num" style={{ fontWeight: 600 }}>{m(x.remaining_minor ?? 0)}</span>
            </div>
          ))}
          <div className="list-row"><strong className="grow">Total a pagar</strong><strong className="num">{m(pos.payable_minor)}</strong></div>
        </section>
        {over.length > 0 && (
          <section className="stack">
            <span className="label">Casos a rever nesta aprovação</span>
            {over.map((x) => <span key={x.person_id} className="num" style={{ fontSize: '0.9rem' }}>{x.display_name} · adiantamentos {g(x.advances.total_minor)} acima do ganho {g(x.earned_minor ?? 0)} · nada a pagar</span>)}
          </section>
        )}
        {contributors.map((x) => <span key={x.person_id} className="muted num" style={{ fontSize: '0.875rem' }}>À parte: {x.display_name} · contribuição em compras {m(x.contributions.total_minor)} · não entra nos valores</span>)}
        <span className="muted" style={{ fontSize: '0.875rem' }}>Distribuição aos sócios: decisão separada, não entra nesta aprovação.</span>
        {ownerUndecided && <div className="notice notice-warning">A decisão dos sócios ainda não está registada. Aprovar fixa a regra de {pos.people.filter((x) => x.is_owner).map((x) => x.display_name).join(' e ')} para este período.</div>}
      </Boundary>
    </main>
  )
}
