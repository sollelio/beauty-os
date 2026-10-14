// Aprovar valores (Slice 06 F10): one boundary for the whole period, with each person's derivation, the cases it
// acknowledges and what stays apart. Submits the reviewed revision (ADR-0005 R-3). On the mobile shell: the final
// "Aprovar …" is the primary action in the bottom bar; after it, back in history to where approval was opened.
import { useOrganization } from '../../modules/org/OrganizationContext'
import { approvePeriod } from '../../modules/period/api'
import { formatAmount, formatMoney } from '../../shared/money'
import { AppScreen } from '../../shared/ui/AppShell'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack } from '../../shared/ui/navigation'
import { PrivateBar } from '../privado/PrivateBar'
import { useFecho } from './fecho'
import { BoundaryScreen, Loading } from './ui'

export function ApprovePage() {
  const org = useOrganization()
  const { q, to } = useFecho()
  const back = useAppBack(to('/privado/fecho'))
  if (!q.data) return <Loading q={q} title="Aprovar valores" />
  const f = q.data, pos = f.position
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const over = pos.people.filter((x) => (x.excess_minor ?? 0) > 0)
  const contributors = pos.people.filter((x) => x.contributions.count > 0)
  const ownerUndecided = pos.owners_decision === null && pos.people.some((x) => x.is_owner && x.rule.kind === 'contextual')
  const bar = <PrivateBar title="Aprovar valores" onBack={back} exit={false} />

  if (!f.readiness.can_approve) {
    return (
      <AppScreen bar={bar}>
        <div className="notice notice-warning" role="status">
          {f.period.state !== 'aberto' ? 'Este período já não está aberto para aprovação.'
            : `Defina as regras de ${pos.pending.map((x) => x.display_name).join(' e ')} para aprovar.`}
        </div>
        <button className="btn btn-secondary" onClick={back}>Voltar ao Fecho</button>
      </AppScreen>
    )
  }
  return (
    <BoundaryScreen bar={bar} permission="period.decide" run={approvePeriod} input={{ periodId: f.period.id, revision: f.review_revision }}
      intro="Só uma pessoa autorizada aprova os valores a pagar." label={`Aprovar ${m(pos.payable_minor)}`} onSuccess={back} onBack={back}
      lockNote="Fica no histórico com quem aprovou e quando. O período passa a «Pronto para pagamento»; depois, os valores só mudam com registo de quem e porquê.">
      <ListGroup data-testid="approval-lines">
        {pos.people.map((x) => (
          <ListRow key={x.person_id} title={x.display_name}
            subtitle={<span className="num">{(x.excess_minor ?? 0) > 0 ? `nada a pagar · adiantamentos ${g(x.advances.total_minor)} acima do ganho ${g(x.earned_minor ?? 0)}`
              : `= ganho ${g(x.earned_minor ?? 0)} − adiantamentos ${g(x.advances.total_minor)}${x.payments.count ? ` − pagos ${g(x.payments.total_minor)}` : ''}`}</span>}
            trailing={<span className="row-value num">{m(x.remaining_minor ?? 0)}</span>} />
        ))}
        <ListRow title="Total a pagar" trailing={<strong className="row-value num">{m(pos.payable_minor)}</strong>} />
      </ListGroup>
      {over.length > 0 && (
        <section className="stack">
          <span className="label">Casos a rever nesta aprovação</span>
          {over.map((x) => <span key={x.person_id} className="num">{x.display_name} · adiantamentos {g(x.advances.total_minor)} acima do ganho {g(x.earned_minor ?? 0)} · nada a pagar</span>)}
        </section>
      )}
      {contributors.map((x) => <span key={x.person_id} className="support num">À parte: {x.display_name} · contribuição em compras {m(x.contributions.total_minor)} · não entra nos valores</span>)}
      <span className="support">Distribuição aos sócios: decisão separada, não entra nesta aprovação.</span>
      {ownerUndecided && <div className="notice notice-warning">A decisão dos sócios ainda não está registada. Aprovar fixa a regra de {pos.people.filter((x) => x.is_owner).map((x) => x.display_name).join(' e ')} para este período.</div>}
    </BoundaryScreen>
  )
}
