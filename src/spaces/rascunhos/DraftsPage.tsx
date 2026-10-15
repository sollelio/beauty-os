// Por confirmar com PIN (Offline 6): the movements saved on this phone without a connection, waiting for the online
// confirmation. Identification only — what, when, how much, for whom/what — as capture already shows it. Nothing is
// sent from here: opening one leads to its flow, where a person confirms it with PIN, or discards it.
import { useNavigate } from 'react-router'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { DRAFT_PARAM, usePendingDrafts } from '../../modules/movements/useMovement'
import type { DraftSummary } from '../../modules/movements/drafts'
import type { MovementKind } from '../../modules/movements/snapshot'
import { formatMoney } from '../../shared/money'
import { isOfflineMode, useOfflineRuntime } from '../../shared/offline/runtime'
import { formatWhen } from '../../shared/time'
import { AppBar, AppScreen } from '../../shared/ui/AppShell'
import { ListGroup, ListRow, RowIcon } from '../../shared/ui/ListRow'
import { useAppBack } from '../../shared/ui/navigation'
import { StatusChip } from '../../shared/ui/StatusChip'
import { EmptyState, Skeleton } from '../../shared/ui/states'
import { KIND_LABEL } from './copy'

const PATH: Record<MovementKind, string> = { advance: '/equipa/adiantamento', expense: '/dinheiro/despesa', purchase: '/dinheiro/compra' }
const ICON = { advance: 'card', expense: 'receipt', purchase: 'box' } as const

export function DraftsPage() {
  const org = useOrganization()
  const navigate = useNavigate()
  const back = useAppBack('/')
  const runtime = useOfflineRuntime()
  const drafts = usePendingDrafts()
  const offline = isOfflineMode(runtime)

  // opened as if walked through: steps 1 → 2 → 3 are history entries, so ← goes back through the flow to this list
  function open(d: DraftSummary) {
    const base = `${PATH[d.type]}?${DRAFT_PARAM}=${d.draftId}`
    navigate(base)
    navigate(`${base}&passo=2`)
    navigate(`${base}&passo=3`)
  }

  return (
    <AppScreen bar={<AppBar title="Por confirmar com PIN" leading="back" onLeading={back} />}>
      <p className="note support">
        {offline
          ? 'Guardados neste telemóvel sem ligação. Só são registados depois de confirmados com PIN, quando houver ligação.'
          : 'Guardados neste telemóvel sem ligação. Abra um para o confirmar com PIN ou para o descartar.'}
      </p>
      {drafts.isPending && <Skeleton rows={2} />}
      {drafts.data && drafts.data.length === 0 && <EmptyState icon="check" title="Nada por confirmar." />}
      {drafts.data && drafts.data.length > 0 && (
        <ListGroup>
          {drafts.data.map((d) => (
            <ListRow key={d.draftId} as="button" onClick={() => open(d)} chevron leading={<RowIcon name={ICON[d.type]} />}
              title={<strong>{KIND_LABEL[d.type]} · {d.title}</strong>}
              subtitle={<span className="num">{formatWhen(d.capturedAt, org.timezone)}</span>}
              trailing={<>
                {d.review && <StatusChip tone="warning">Precisa de revisão</StatusChip>}
                <span className="row-value num">{formatMoney(d.amountMinor, org)}</span>
              </>} />
          ))}
        </ListGroup>
      )}
    </AppScreen>
  )
}
