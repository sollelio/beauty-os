// Para rever (Offline 7): what this phone holds that a person has to decide about — services the server did not
// accept, movement drafts it refused, and work left by another link of this phone. Calm reasons, never a backend code;
// only safe actions: nothing is changed, moved or re-dated automatically, and discarding is explicit and local.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import {
  discardServiceItem, listServiceConflicts, readCaptureSnapshot, UNCERTAIN_SERVICE_CONFLICTS,
  type ServiceConflict,
} from '../../modules/services/offline'
import { DRAFT_PARAM, usePendingDrafts } from '../../modules/movements/useMovement'
import type { DraftSummary } from '../../modules/movements/drafts'
import { formatMoney } from '../../shared/money'
import { offlineKeys, useOfflineRuntime } from '../../shared/offline/runtime'
import { formatWhen } from '../../shared/time'
import { AppBar, AppScreen } from '../../shared/ui/AppShell'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { ListGroup, ListRow, RowIcon } from '../../shared/ui/ListRow'
import { useAppBack } from '../../shared/ui/navigation'
import { StatusChip } from '../../shared/ui/StatusChip'
import { EmptyState, Skeleton } from '../../shared/ui/states'
import { DISCARD_LOCAL, DISCARD_UNCERTAIN, KIND_LABEL, reviewText, serviceReviewText } from './copy'

const PATH = { advance: '/equipa/adiantamento', expense: '/dinheiro/despesa', purchase: '/dinheiro/compra' } as const
const reviewKey = (p: { organizationId: string; deviceUserId: string } | undefined) => [...offlineKeys.all, 'review', p?.organizationId ?? '', p?.deviceUserId ?? '']

export function ReviewPage() {
  const org = useOrganization()
  const navigate = useNavigate()
  const back = useAppBack('/')
  const queryClient = useQueryClient()
  const runtime = useOfflineRuntime()
  const access = runtime.storeAccess
  const services = useQuery({
    queryKey: reviewKey(access?.partition),
    queryFn: async () => {
      const store = await access!.getStore()
      const [items, snap] = await Promise.all([listServiceConflicts(store), readCaptureSnapshot(store)])
      return { items, people: new Map(snap?.people.map((p) => [p.id, p.display_name])), names: new Map(snap?.services.map((s) => [s.id, s.name])) }
    },
    enabled: !!access, networkMode: 'always', retry: false, staleTime: 0,
  })
  const drafts = usePendingDrafts()
  const reviewDrafts = (drafts.data ?? []).filter((d) => d.review)
  const [ask, setAsk] = useState<{ kind: 'discard'; item: ServiceConflict } | { kind: 'foreign' } | null>(null)

  const done = async () => {
    await Promise.all([runtime.refresh(), queryClient.invalidateQueries({ queryKey: offlineKeys.all })])
  }
  const act = useMutation({
    networkMode: 'always',
    mutationFn: async (a: { op: 'discard'; commandId: string } | { op: 'foreign' }) => {
      if (a.op === 'foreign') return runtime.discardForeign()
      await discardServiceItem(await access!.getStore(), a.commandId)
    },
    onSuccess: done,
  })

  function openDraft(d: DraftSummary) {
    const base = `${PATH[d.type]}?${DRAFT_PARAM}=${d.draftId}`
    navigate(base); navigate(`${base}&passo=2`); navigate(`${base}&passo=3`)
  }

  const foreign = runtime.local?.foreign
  const loading = services.isPending || drafts.isPending
  const nothing = !loading && (services.data?.items.length ?? 0) === 0 && reviewDrafts.length === 0 && !(foreign && foreign.partitions > 0)

  return (
    <AppScreen bar={<AppBar title="Para rever" leading="back" onLeading={back} />}>
      <p className="note support">Registos guardados neste telemóvel que o servidor não aceitou. Nada é alterado sozinho: decida o que fazer com cada um.</p>
      {loading && <Skeleton rows={2} />}
      {nothing && <EmptyState icon="check" title="Nada para rever." />}

      {services.data && services.data.items.length > 0 && (
        <section className="stack" aria-label="Serviços para rever">
          <span className="label">Serviços</span>
          {services.data.items.map((s) => (
            <div key={s.commandId} className="panel stack stack-tight" data-testid="service-conflict">
              <strong>{(s.serviceId && services.data.names.get(s.serviceId)) || 'Serviço'} · {(s.personId && services.data.people.get(s.personId)) || '—'}</strong>
              <span className="support num">{s.valueMinor !== null ? `${formatMoney(s.valueMinor, org)} · ` : ''}guardado {formatWhen(s.occurredAt, org.timezone)}</span>
              <span>{serviceReviewText(s.code)}</span>
              <div className="wrap">
                <button className="btn btn-secondary btn-fit" onClick={() => navigate('/servicos/registar')}>Registar novamente</button>
                <button className="link-btn" onClick={() => setAsk({ kind: 'discard', item: s })}>Descartar</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {reviewDrafts.length > 0 && (
        <section className="stack" aria-label="Movimentos para rever">
          <span className="label">Por confirmar com PIN</span>
          <ListGroup>
            {reviewDrafts.map((d) => (
              <ListRow key={d.draftId} as="button" onClick={() => openDraft(d)} chevron leading={<RowIcon name="lock" tone="quiet" />}
                title={<strong>{KIND_LABEL[d.type]} · {d.title}</strong>}
                subtitle={<span>{reviewText(d.review!.code)}</span>}
                trailing={<><StatusChip tone="warning">Precisa de revisão</StatusChip><span className="row-value num">{formatMoney(d.amountMinor, org)}</span></>} />
            ))}
          </ListGroup>
        </section>
      )}

      {foreign && foreign.partitions > 0 && (
        <section className="panel stack stack-tight" aria-label="De outra ligação" data-testid="foreign-work">
          <strong>Trabalho de uma ligação anterior deste telemóvel</strong>
          <span>{foreign.unsyncedWork > 0
            ? (foreign.unsyncedWork === 1 ? 'Há 1 registo guardado por uma ligação anterior. Não pode ser enviado por esta ligação.'
              : `Há ${foreign.unsyncedWork} registos guardados por uma ligação anterior. Não podem ser enviados por esta ligação.`)
            : 'Há dados de uma ligação anterior, sem nada por enviar.'}</span>
          <button className="link-btn self-start" onClick={() => setAsk({ kind: 'foreign' })}>Apagar deste telemóvel</button>
        </section>
      )}

      {ask?.kind === 'discard' && (
        <ConfirmDialog title="Descartar este registo?" safeLabel="Manter" destructiveLabel="Descartar"
          onSafe={() => setAsk(null)} onDestructive={() => { act.mutate({ op: 'discard', commandId: ask.item.commandId }); setAsk(null) }}>
          {UNCERTAIN_SERVICE_CONFLICTS.has(ask.item.code) ? DISCARD_UNCERTAIN : DISCARD_LOCAL}
        </ConfirmDialog>
      )}
      {ask?.kind === 'foreign' && (
        <ConfirmDialog title="Apagar o trabalho da ligação anterior?" safeLabel="Manter" destructiveLabel="Apagar"
          onSafe={() => setAsk(null)} onDestructive={() => { act.mutate({ op: 'foreign' }); setAsk(null) }}>
          Estes registos nunca chegaram ao servidor por esta ligação e não vão ser enviados. Apagar remove-os só deste telemóvel; não muda nada no servidor. Não pode ser desfeito.
        </ConfirmDialog>
      )}
    </AppScreen>
  )
}
