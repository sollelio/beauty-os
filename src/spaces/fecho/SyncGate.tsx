// Fecho's offline sync gate (ADR-0010 §5; Offline 7): a period is approved or closed only when every offline-capable
// phone of the salon is synchronized for it. The server enforces it (PERIOD_OFFLINE_SYNC_PENDING); this shows it.
// A live read, never kept for offline use; this phone sends its own report first so it is never the one missing.
// Per phone: its enrollment label (never an id), why it blocks, and what to do on it. No override.
import type { SyncDevice, SyncStatus } from '../../modules/period/api'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { ListGroup } from '../../shared/ui/ListRow'
import { formatDayShort, formatWhen } from '../../shared/time'

type Verb = 'aprovar' | 'fechar'
const phones = (n: number) => `${n} ${n === 1 ? 'telemóvel' : 'telemóveis'}`
const records = (n: number) => `${n} ${n === 1 ? 'registo' : 'registos'}`
/** The day after a "YYYY-MM-DD" date, as "YYYY-MM-DD" (the period ends at the start of that day). */
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

export function SyncNotice({ status, verb, onOpen }: { status: SyncStatus; verb: Verb; onOpen: () => void }) {
  const waiting = status.pending + status.silent
  return (
    <div className="notice notice-warning stack stack-tight" role="status" data-testid="sync-notice">
      {status.period_ended === false ? <>
        <strong>Este período ainda não terminou.</strong>
        <span>Só pode {verb} depois do fim do período, quando cada telemóvel confirmar o seu estado.</span>
      </> : <>
        <strong>Há registos offline por sincronizar antes de {verb} este período.</strong>
        <span>{phones(waiting)} ainda {waiting === 1 ? 'precisa' : 'precisam'} de atenção.</span>
      </>}
      <button className="link-btn self-start" onClick={onOpen}>Ver estado da sincronização</button>
    </div>
  )
}

type View = { tone: 'success' | 'warning' | 'danger' | 'neutral'; badge: string; reasons: string[]; actions: string[]; lastSeen?: boolean; lost?: boolean }

/** What a phone's state means for the people at the salon: why it blocks and what to do on it. */
function deviceView(d: SyncDevice, periodEnded: boolean, endsOn: string, timeZone: string): View {
  if (d.state === 'ready') return { tone: 'success', badge: 'Sincronizado', reasons: ['Este telemóvel já está pronto para o fecho.'], actions: [] }
  if (d.state === 'silent') {
    if (!periodEnded) {
      return { tone: 'neutral', badge: 'Aguarda o fim do período', reasons: [`O período termina no fim de ${formatDayShort(endsOn, timeZone)}.`],
        actions: [`A partir de ${formatDayShort(nextDay(endsOn), timeZone)}, abra o Beauty OS neste telemóvel com Internet.`] }
    }
    if (d.this_device) {
      return { tone: 'warning', badge: 'Precisa de ligação', reasons: ['Este telemóvel ainda não conseguiu confirmar o seu estado.'],
        actions: ['Ligue-o à Internet e toque em «Atualizar».'] }
    }
    return { tone: 'warning', badge: 'Sem estado recente', reasons: ['Este telemóvel ainda não confirmou o seu estado depois do fim do período.'],
      actions: ['Abra o Beauty OS neste telemóvel com Internet para confirmar o estado.'], lastSeen: true, lost: true }
  }
  const reasons: string[] = [], actions: string[] = []
  if (d.conflicts > 0) {
    reasons.push(d.conflicts === 1 ? 'Há um registo que precisa de ser revisto neste telemóvel.' : `Há ${d.conflicts} registos que precisam de ser revistos neste telemóvel.`)
    actions.push('Neste telemóvel, no Hoje, toque em «para rever» e decida cada um.')
  }
  if (d.drafts > 0) {
    reasons.push(d.drafts === 1 ? 'Há um movimento guardado neste telemóvel por confirmar com PIN.' : `Há ${d.drafts} movimentos guardados neste telemóvel por confirmar com PIN.`)
    actions.push('Neste telemóvel, com Internet, no Hoje, toque em «por confirmar com PIN» e confirme cada um.')
  }
  if (d.services > 0) {
    reasons.push(`Este telemóvel ainda tem ${records(d.services)} por enviar.`)
    actions.push('Abra o Beauty OS neste telemóvel com Internet e aguarde a sincronização.')
  }
  if (!reasons.length) {                                        // not expected: pending always carries a count
    reasons.push('Este telemóvel ainda tem registos guardados para este período.')
    actions.push('Abra o Beauty OS neste telemóvel com Internet e aguarde a sincronização.')
  }
  const badge = d.conflicts > 0 ? 'Precisa de revisão' : d.drafts > 0 ? 'Por confirmar com PIN' : 'Registos por enviar'
  return { tone: d.conflicts > 0 ? 'danger' : 'warning', badge, reasons, actions }
}

function DeviceRow({ d, periodEnded, endsOn }: { d: SyncDevice; periodEnded: boolean; endsOn: string }) {
  const { timezone } = useOrganization()
  const v = deviceView(d, periodEnded, endsOn, timezone)
  const name = d.label?.trim() || 'Telemóvel sem nome'
  return (
    <section className="row-block" aria-label={name} data-state={d.state}>
      <div className="row-between">
        <span className="row-body">
          <span className="row-title">{name}{d.this_device && <span className="muted"> · este telemóvel</span>}</span>
          <span className="row-subtitle">Ligado ao salão desde {formatDayShort(d.enrolled_at, timezone)}</span>
        </span>
        <span className={`status-chip status-${v.tone}`}>{v.badge}</span>
      </div>
      <div className="stack stack-tight">
        {v.reasons.map((r) => <span key={r} className="note">{r}</span>)}
        {v.actions.map((a) => <strong key={a}>{a}</strong>)}
        {v.lastSeen && d.reported_at && <span className="support">Último contacto: {formatWhen(d.reported_at, timezone)}</span>}
        {v.lost && <span className="support">Se este telemóvel deixou de ser usado, contacte a Sollelio para o desligar do salão.</span>}
      </div>
    </section>
  )
}

const ORDER: Record<SyncDevice['state'], number> = { pending: 0, silent: 1, ready: 2 }

export function SyncStatusSheet({ status, verb, endsOn, onDismiss, onRefresh, refreshing }: {
  status: SyncStatus; verb: Verb; endsOn: string; onDismiss: () => void; onRefresh: () => void; refreshing: boolean
}) {
  const { timezone } = useOrganization()
  const waiting = status.pending + status.silent
  const devices = status.devices && [...status.devices].sort((a, b) => ORDER[a.state] - ORDER[b.state])
  const periodEnded = status.period_ended !== false
  return (
    <BottomSheet labelledBy="sync-gate-title" onDismiss={onDismiss}>
      <h2 id="sync-gate-title" className="sheet-title">Estado da sincronização</h2>
      <div className="stack stack-tight" data-testid="sync-gate-summary" aria-live="polite">
        {status.safe ? <>
          <strong>Todos os telemóveis estão sincronizados</strong>
          <span className="support">Já pode voltar ao fecho.</span>
        </> : !periodEnded ? <>
          <strong>Este período ainda não terminou</strong>
          <span className="support">Cada telemóvel só pode confirmar o seu estado depois do fim do período. Volte a {verb} a partir de {formatDayShort(nextDay(endsOn), timezone)}.</span>
        </> : <>
          <strong>{phones(waiting)} {waiting === 1 ? 'precisa' : 'precisam'} de atenção</strong>
          <span className="support">Resolva os pontos abaixo antes de {verb} este período.</span>
        </>}
      </div>
      {devices ? (
        devices.length > 0 && (
          <ListGroup className="sync-devices" data-testid="sync-devices">
            {devices.map((d, i) => <DeviceRow key={`${d.enrolled_at}-${i}`} d={d} periodEnded={periodEnded} endsOn={endsOn} />)}
          </ListGroup>
        )
      ) : (
        // a database without the per-device read: the counts, as before
        <dl className="row-group value-list" data-testid="sync-gate-status">
          {([['Sincronizados para este período', status.ready], ['Com registos por enviar, confirmar ou rever', status.pending],
            ['Sem notícias desde o fim do período', status.silent]] as [string, number][]).map(([k, v]) => (
            <div key={k} className="row value-row"><dt>{k}</dt><dd className="num">{phones(v)}</dd></div>
          ))}
        </dl>
      )}
      <button className="btn btn-secondary" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'A atualizar…' : 'Atualizar'}</button>
      <button className="btn btn-secondary" onClick={onDismiss}>Fechar</button>
    </BottomSheet>
  )
}
