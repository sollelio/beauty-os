// Offline V1 status UI (ADR-0010 §11): a calm global "Sem ligação" while the browser is offline, a guard for areas
// that need a connection, and a small status sheet with counts and dates only — never record content.
import type { ReactNode } from 'react'
import { useOrganization } from '../../modules/org/OrganizationContext'
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

export function SyncStatusSheet({ onDismiss }: { onDismiss: () => void }) {
  const org = useOrganization()
  const { connectivity, local } = useOfflineRuntime()
  const last = local?.lastSuccessfulSyncAt
  const waiting = local ? local.outboxPending - local.outboxFailed - local.outboxConflicts : 0
  const rows: [string, string | number][] = [
    ['Ligação', connectivity === 'offline' ? OFFLINE_TITLE : 'Com ligação'],
    ['Por enviar', waiting],
    ...(local && local.outboxFailed > 0 ? [['Envio falhou', local.outboxFailed] as [string, number]] : []),
    ...(local && local.outboxConflicts > 0 ? [['Precisam de revisão', local.outboxConflicts] as [string, number]] : []),
    ...(local && local.draftsPending > 0 ? [['Por confirmar com PIN', local.draftsPending] as [string, number]] : []),
    ['Último envio', last ? `${formatDayShort(last, org.timezone)}, ${formatTime(last, org.timezone)}` : 'Ainda nenhum'],
  ]
  return (
    <BottomSheet labelledBy="sync-status-title" onDismiss={onDismiss}>
      <h2 id="sync-status-title" className="sheet-title">Neste telemóvel</h2>
      <p className="support">Registos guardados neste telemóvel que ainda não chegaram ao servidor.</p>
      <dl className="row-group value-list" data-testid="sync-status">
        {rows.map(([k, v]) => <div key={k} className="row value-row"><dt>{k}</dt><dd className="num">{v}</dd></div>)}
      </dl>
      <button className="btn btn-secondary" onClick={onDismiss}>Fechar</button>
    </BottomSheet>
  )
}
