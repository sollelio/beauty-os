// Team list inside the private context (B4) — the private area's root for a manager. Slice 04 leaves the Equipa list
// undesigned: names and capabilities only, as the entry to each person's situation; no figures here. On the mobile
// shell (UX slice 7): the private bar with × as the explicit exit (this is the root), whole rows, and the private
// destinations the person's permissions open — the same ones as before, the database still deciding what each shows.
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { listTeamPeople, situationKeys } from '../../modules/team/situation'
import { usePrivateContext } from '../../modules/org/privateContext'
import { AppScreen } from '../../shared/ui/AppShell'
import { ListGroup, ListRow, RowIcon } from '../../shared/ui/ListRow'
import { EmptyState, ErrorState, Skeleton } from '../../shared/ui/states'
import { PrivateBar } from './PrivateBar'

export function EquipaPage() {
  const navigate = useNavigate()
  const ctx = usePrivateContext()
  const team = useQuery({ queryKey: situationKeys.team, queryFn: listTeamPeople })
  return (
    <AppScreen bar={<PrivateBar title="Equipa" root />}>
      <section className="stack">
        <span className="label">Pessoas</span>
        {team.isPending && <Skeleton rows={3} />}
        {team.isError && <ErrorState onRetry={() => team.refetch()}>Não foi possível carregar a equipa.</ErrorState>}
        {team.isSuccess && team.data.length === 0 && (
          <EmptyState icon="person" title="Ainda sem equipa">Aparecem aqui as pessoas da equipa que fazem serviços.</EmptyState>
        )}
        {team.isSuccess && team.data.length > 0 && (
          <ListGroup>
            {team.data.map((p) => (
              <ListRow key={p.id} as="button" onClick={() => navigate(`/privado/situacao/${p.id}`)} chevron
                leading={<span className="avatar row-avatar" aria-hidden>{p.display_name.slice(0, 1)}</span>}
                title={p.display_name} subtitle={p.capabilities.length ? p.capabilities.join(' · ') : undefined} />
            ))}
          </ListGroup>
        )}
      </section>
      <section className="stack">
        <span className="label">Área privada</span>
        <ListGroup>
          <ListRow as="button" onClick={() => navigate('/privado/fecho')} leading={<RowIcon name="calendarCheck" tone="quiet" />} title="Fecho do período" chevron />
          {ctx.business_health && <ListRow as="button" onClick={() => navigate('/privado/negocio')} leading={<RowIcon name="chart" tone="quiet" />} title="Negócio · Visão geral" chevron />}
          {ctx.catalogue_manage && <ListRow as="button" onClick={() => navigate('/privado/gestao')} leading={<RowIcon name="edit" tone="quiet" />} title="Gestão · Serviços e produtos" chevron />}
        </ListGroup>
      </section>
      <p className="note support">A área privada fecha ao sair e ao fim de pouco tempo.</p>
    </AppScreen>
  )
}
