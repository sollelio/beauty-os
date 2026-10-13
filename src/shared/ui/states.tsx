// The states kit (UX slice 4): what a section shows while it loads, when it is genuinely empty and when it failed.
// Three answers that never look alike, scoped to their section so the rest of the screen stays usable.
// - Skeleton: static neutral shapes in the size of what is coming, invisible for the first 300ms (fast answers never
//   flash it), no shimmer; announced as busy.
// - EmptyState: shown only once loading succeeded — an icon, a short title, one sentence, an optional action.
// - ErrorState: a plain sentence for salon staff (never the technical error) and Retry when retrying makes sense;
//   whatever the person typed stays where it was.
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export function Skeleton({ rows = 3, headline = false, label = 'A carregar' }: { rows?: number; headline?: boolean; label?: string }) {
  return (
    <div className="skeleton" role="status" aria-busy="true" aria-label={label}>
      {headline && <span className="skeleton-headline" />}
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skeleton-row"><span className="skeleton-line skeleton-title" /><span className="skeleton-line skeleton-sub" /></span>
      ))}
    </div>
  )
}

export function EmptyState({ icon = 'box', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-state-icon"><Icon name={icon} size={22} /></span>
      <span className="empty-state-title">{title}</span>
      {children && <span className="empty-state-text">{children}</span>}
      {action && <span className="empty-state-action">{action}</span>}
    </div>
  )
}

export function ErrorState({ children, onRetry, retryLabel = 'Tentar novamente', action }: {
  children: ReactNode; onRetry?: () => void; retryLabel?: string; action?: ReactNode
}) {
  return (
    <div className="notice notice-error error-state" role="alert">
      <span className="error-state-text">{children}</span>
      {(onRetry || action) && (
        <span className="error-state-actions">
          {onRetry && <button type="button" className="link-btn" onClick={onRetry}>{retryLabel}</button>}
          {action}
        </span>
      )}
    </div>
  )
}
