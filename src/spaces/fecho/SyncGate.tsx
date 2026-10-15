// Fecho's offline sync gate (ADR-0010 §5; Offline 7): a period is approved or closed only when every offline-capable
// phone of the salon is synchronized for it. The server enforces it (PERIOD_OFFLINE_SYNC_PENDING); this shows it.
// A live read, never kept for offline use; this phone sends its own report first so it is never the one missing.
// Counts only — no device names or ids. No override.
import type { SyncStatus } from '../../modules/period/api'
import { BottomSheet } from '../../shared/ui/BottomSheet'

const phones = (n: number) => `${n} ${n === 1 ? 'telemóvel' : 'telemóveis'}`

export function SyncNotice({ status, verb, onOpen }: { status: SyncStatus; verb: 'aprovar' | 'fechar'; onOpen: () => void }) {
  const waiting = status.pending + status.silent
  return (
    <div className="notice notice-warning stack stack-tight" role="status" data-testid="sync-notice">
      <strong>Há registos offline por sincronizar antes de {verb} este período.</strong>
      <span>{phones(waiting)} ainda {waiting === 1 ? 'precisa' : 'precisam'} de atenção.</span>
      <button className="link-btn self-start" onClick={onOpen}>Ver estado da sincronização</button>
    </div>
  )
}

export function SyncStatusSheet({ status, onDismiss, onRefresh, refreshing }: { status: SyncStatus; onDismiss: () => void; onRefresh: () => void; refreshing: boolean }) {
  const rows: [string, number][] = [
    ['Sincronizados para este período', status.ready],
    ['Com registos por enviar, confirmar ou rever', status.pending],
    ['Sem notícias desde o fim do período', status.silent],
  ]
  return (
    <BottomSheet labelledBy="sync-gate-title" onDismiss={onDismiss}>
      <h2 id="sync-gate-title" className="sheet-title">Estado da sincronização</h2>
      <dl className="row-group value-list" data-testid="sync-gate-status">
        {rows.map(([k, v]) => <div key={k} className="row value-row"><dt>{k}</dt><dd className="num">{phones(v)}</dd></div>)}
      </dl>
      <p className="support">Cada telemóvel com o Beauty OS envia o seu estado quando abre a aplicação com ligação. Um telemóvel com registos guardados tem de os enviar, confirmar ou rever.</p>
      {status.silent > 0 && <p className="support">Um telemóvel perdido ou que deixou de ser usado continua a contar até a Sollelio o desligar do salão.</p>}
      <button className="btn btn-secondary" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'A atualizar…' : 'Atualizar'}</button>
      <button className="btn btn-secondary" onClick={onDismiss}>Fechar</button>
    </BottomSheet>
  )
}
