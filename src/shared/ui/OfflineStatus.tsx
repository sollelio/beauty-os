// Offline V1 status UI (ADR-0010 §11): a calm global "Sem ligação" while the browser is offline, a guard for areas
// that need a connection, and a small status sheet with counts and dates only — never record content.
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { useTenantMark } from '../../modules/org/tenantMark'
import { useConnectivity } from '../offline/connectivity'
import { useOfflineRuntime } from '../offline/runtime'
import { formatDayShort, formatTime } from '../time'
import { BottomSheet } from './BottomSheet'
import { OFFLINE_SUPPORT, OFFLINE_TITLE } from './offlineCopy'

export function ConnectivityBanner() {
  if (useConnectivity() === 'online') return null
  return (
    <div className="offline-banner" role="status">
      <strong>{OFFLINE_TITLE}</strong>
      <span>{OFFLINE_SUPPORT}</span>
    </div>
  )
}

/** Shows `children` online; offline, a quiet note instead (e.g. PRIVATE_NEEDS_CONNECTION). Not wired to screens yet. */
export function NeedsConnection({ message, children }: { message: string; children: ReactNode }) {
  if (useConnectivity() === 'offline') return <div className="notice notice-neutral" role="status">{message}</div>
  return <>{children}</>
}

/** «Este telemóvel» (Tenant Identity T1): the salon this phone is bound to, and its work not yet on the server. Opened from
 *  Hoje's salon line (always) and from Hoje's "por enviar" row; `onReplay` offers the Beauty OS presentation again. */
export function SyncStatusSheet({ onDismiss, onReplay }: { onDismiss: () => void; onReplay?: () => void }) {
  const org = useOrganization()
  const mark = useTenantMark()
  const navigate = useNavigate()
  const { connectivity, local, sync, syncNow } = useOfflineRuntime()
  const busy = sync.status === 'checking' || sync.status === 'syncing'
  const last = local?.lastSuccessfulSyncAt
  const waiting = local ? local.outboxPending - local.outboxFailed - local.outboxConflicts : 0
  const rows: [string, ReactNode][] = [
    ['Ligado a', mark ? <span className="tenant-ref"><img src={mark.src32} alt="" width={24} height={24} />{org.name}</span> : org.name],
    ['Ligação', connectivity === 'offline' ? OFFLINE_TITLE : 'Com ligação'],
    ['Por enviar', waiting],
    ...(local && local.outboxFailed > 0 ? [['Envio falhou', local.outboxFailed] as [string, number]] : []),
    ...(local && local.draftsPending - local.draftsReview > 0 ? [['Por confirmar com PIN', local.draftsPending - local.draftsReview] as [string, number]] : []),
    ...(local && local.outboxConflicts + local.draftsReview > 0 ? [['Para rever', local.outboxConflicts + local.draftsReview] as [string, number]] : []),
    ['Último envio', last ? `${formatDayShort(last, org.timezone)}, ${formatTime(last, org.timezone)}` : 'Ainda nenhum'],
  ]
  return (
    <BottomSheet labelledBy="sync-status-title" onDismiss={onDismiss}>
      <h2 id="sync-status-title" className="sheet-title">Este telemóvel</h2>
      <p className="support">A que salão está ligado e o que ainda não chegou ao servidor.</p>
      {local && local.outboxConflicts + local.draftsReview > 0 && (
        <p className="notice notice-warning">Alguns registos não foram aceites pelo servidor e precisam de revisão. Continuam guardados neste telemóvel.</p>
      )}
      <dl className="row-group value-list" data-testid="sync-status">
        {rows.map(([k, v]) => <div key={k} className="row value-row"><dt>{k}</dt><dd className="num">{v}</dd></div>)}
      </dl>
      {connectivity === 'online' && local && waiting + local.outboxFailed > 0 && (
        <button className="btn btn-primary" onClick={() => void syncNow()} disabled={busy}>{busy ? 'A enviar…' : 'Enviar agora'}</button>
      )}
      {local && local.outboxConflicts + local.draftsReview > 0 && (
        <button className="btn btn-secondary" onClick={() => navigate('/rever')}>Rever</button>
      )}
      {local && local.draftsPending - local.draftsReview > 0 && (
        <button className="btn btn-secondary" onClick={() => navigate('/rascunhos')}>Ver por confirmar com PIN</button>
      )}
      {onReplay && <button className="btn btn-secondary" onClick={onReplay}>Ver a apresentação do Beauty OS</button>}
      <button className="btn btn-secondary" onClick={onDismiss}>Fechar</button>
    </BottomSheet>
  )
}
