// Fecho building blocks (Slice 06 §16) on the mobile shell (UX slice 7): the private bar, the state strip, status chips,
// review rows, value rows, the loading/error screen and the Confirmação necessária boundary used by every Fecho decision
// (one-shot verification, ADR-0009). The boundary is split into its form and its actions so a screen puts the final
// action in the bottom bar and a sheet keeps it inside the sheet; the command, the grant and the messages are unchanged.
import type { ReactNode } from 'react'
import { STATE_LABEL, STATE_ORDER, type PeriodState } from '../../modules/period/api'
import { toAppError } from '../../shared/errors'
import { AppScreen, BottomActionBar } from '../../shared/ui/AppShell'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack } from '../../shared/ui/navigation'
import { StatusChip } from '../../shared/ui/StatusChip'
import { ErrorState, Skeleton } from '../../shared/ui/states'
import { PrivateBar } from '../privado/PrivateBar'
import { useBoundary, type BoundaryProps } from './hooks'

export function StateStrip({ state }: { state: PeriodState }) {
  const i = STATE_ORDER.indexOf(state)
  return (
    <div className="stack stack-tight">
      <div className="progress" aria-hidden>{STATE_ORDER.map((s, n) => <span key={s} className={n <= i ? 'on' : ''} />)}</div>
      <div className="row-between" data-testid="state-strip">
        <strong>{STATE_LABEL[state]}</strong>
        {i < 3 && <span className="support">depois: {STATE_LABEL[STATE_ORDER[i + 1]!]}</span>}
      </div>
    </div>
  )
}

/** Review status, read at a glance: blocks (decide), to review, done, neutral. */
export type PillKind = 'block' | 'review' | 'ok' | 'neutral'
const TONE = { block: 'warning', review: 'caution', ok: 'success', neutral: 'neutral' } as const
export const Pill = ({ kind, children }: { kind: PillKind; children: ReactNode }) => <StatusChip tone={TONE[kind]}>{children}</StatusChip>

/** One "Precisa de atenção" item: a whole tappable row with its status; the amber dot marks what blocks. */
export function ExceptionRow({ dot, title, sub, pill, pillKind, onOpen }: { dot: 'amber' | 'neutral'; title: string; sub: string; pill: string; pillKind: PillKind; onOpen?: () => void }) {
  const slots = {
    leading: <span aria-hidden className={dot === 'amber' ? 'urgent-dot' : 'dot-quiet'} />,
    title, subtitle: <span className="num">{sub}</span>, trailing: <Pill kind={pillKind}>{pill}</Pill>,
  }
  return onOpen ? <ListRow as="button" onClick={onOpen} chevron {...slots} /> : <ListRow {...slots} />
}

export function SummaryRow({ title, sub, onOpen }: { title: string; sub: string; onOpen: () => void }) {
  return <ListRow as="button" onClick={onOpen} title={title} subtitle={<span className="num">{sub}</span>} chevron />
}

/** Label → value rows (money right-aligned in the value column). */
export function KV({ rows, testId }: { rows: [string, ReactNode][]; testId?: string }) {
  return (
    <ListGroup data-testid={testId}>
      {rows.map(([k, v]) => <ListRow key={k} title={<span className="kv-key">{k}</span>} trailing={<span className="row-value num kv-value">{v}</span>} className="kv-row" />)}
    </ListGroup>
  )
}

/** A decision screen: what is decided above the boundary, the final action in the bottom bar (with `extraActions`). */
export function BoundaryScreen<I, R>({ bar, top, after, extraActions, ...props }: BoundaryProps<I, R> & {
  bar: ReactNode; top?: ReactNode; after?: ReactNode; extraActions?: ReactNode
}) {
  const b = useBoundary(props)
  return (
    <AppScreen bar={bar} actions={(b.actions || extraActions) && <BottomActionBar>{b.actions}{extraActions}</BottomActionBar>}>
      {top}
      {b.form}
      {after}
    </AppScreen>
  )
}

/** The same boundary inside a sheet: its actions stay in the sheet, after the form. */
export function SheetBoundary<I, R>(props: BoundaryProps<I, R>) {
  const b = useBoundary(props)
  return <>{b.form}{b.actions && <div className="sheet-actions">{b.actions}</div>}</>
}

/** First load of a Fecho screen, or why it cannot be shown — inside the private bar, with a way back. */
export function Loading({ q, title = 'Fecho' }: { q: { isError: boolean; error: unknown }; title?: string }) {
  const back = useAppBack('/privado')
  const code = q.isError ? toAppError(q.error).code : null
  return (
    <AppScreen bar={<PrivateBar title={title} onBack={back} />}>
      {q.isError ? (
        <ErrorState action={<button type="button" className="link-btn" onClick={back}>Voltar</button>}>
          {code === 'NOT_AUTHORIZED' ? 'O Fecho só está disponível para quem gere as finanças da equipa.'
            : code === 'PERIOD_NOT_FOUND' ? 'Ainda não começou nenhum período.' : 'Não foi possível carregar o Fecho.'}
        </ErrorState>
      ) : <Skeleton rows={4} headline />}
    </AppScreen>
  )
}
