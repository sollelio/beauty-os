// The one row pattern. Slots: leading (icon chip, time, avatar), title, optional subtitle, trailing (value, status,
// chevron). The whole row is the control (button or link) with immediate press feedback; 52px, 64px with a subtitle.
// A ListGroup is one quiet surface with hairlines between rows — never a card inside a card.
import type { HTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon, type IconName } from './Icon'

type Slots = { leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; chevron?: boolean; current?: boolean; className?: string }
type Props = Slots & (
  | { as?: 'div' }
  | { as: 'button'; onClick: () => void; disabled?: boolean; 'aria-label'?: string }
  | { as: 'link'; to: string; state?: unknown }
)

export function ListRow(props: Props) {
  const { leading, title, subtitle, trailing, chevron, current, className } = props
  const tappable = props.as === 'button' || props.as === 'link'
  const cls = ['row', subtitle ? 'row-with-subtitle' : '', tappable ? 'row-tappable' : '', className ?? ''].filter(Boolean).join(' ')
  const body = (
    <>
      {leading && <span className="row-leading">{leading}</span>}
      <span className="row-body">
        <span className="row-title">{title}</span>
        {subtitle && <span className="row-subtitle">{subtitle}</span>}
      </span>
      {(trailing || chevron) && (
        <span className="row-trailing">
          {trailing}
          {chevron && <span className="row-chevron"><Icon name="chevronRight" /></span>}
        </span>
      )}
    </>
  )
  const aria = { 'aria-current': current || undefined }
  if (props.as === 'button') return <button type="button" className={cls} onClick={props.onClick} disabled={props.disabled} aria-label={props['aria-label']} {...aria}>{body}</button>
  if (props.as === 'link') return <Link to={props.to} state={props.state} className={cls} {...aria}>{body}</Link>
  return <div className={cls} {...aria}>{body}</div>
}

export function ListGroup({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={['row-group', className ?? ''].filter(Boolean).join(' ')} {...rest}>{children}</div>
}

/** A row's leading icon chip: accent for shared actions, quiet for the private ones, warning for attention. */
export function RowIcon({ name, tone = 'accent' }: { name: IconName; tone?: 'accent' | 'quiet' | 'warning' }) {
  return <span className={`row-icon${tone === 'quiet' ? ' row-icon-quiet' : tone === 'warning' ? ' row-icon-warning' : ''}`}><Icon name={name} /></span>
}
