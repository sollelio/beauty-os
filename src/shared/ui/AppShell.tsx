// Mobile app shell (UX foundation slice): a full-height screen with a sticky app bar, a scrolling body and an optional
// bottom action bar that keeps the primary action in the thumb zone (above the keyboard where the browser resizes the
// viewport for it, and clear of the bottom safe area). No brand identity here: tokens from base.css only.
import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function AppScreen({ bar, actions, children }: { bar?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="app-screen">
      {bar}
      <main className="app-screen-body">{children}</main>
      {actions}
    </div>
  )
}

/** `close` (×) leaves a task; `back` (←) returns one level. `step` turns it into the flow variant: count and progress.
 *  `trailing`: one small status or action at the end of the bar (e.g. a trip's "3 de 4").
 *  `tone="private"` with an `overline` marks a protected workspace (the private area): a tinted bar that says so. */
export function AppBar({ title, leading, onLeading, leadingLabel, step, trailing, overline, tone }: {
  title: string; leading: 'back' | 'close'; onLeading: () => void; leadingLabel?: string; step?: { current: number; total: number }
  trailing?: ReactNode; overline?: ReactNode; tone?: 'private'
}) {
  return (
    <header className={tone === 'private' ? 'app-bar app-bar-private' : 'app-bar'}>
      {overline && <div className="app-bar-overline">{overline}</div>}
      <div className="app-bar-row">
        <button className="app-bar-btn" aria-label={leadingLabel ?? (leading === 'close' ? 'Fechar' : 'Voltar')} onClick={onLeading}>
          <Icon name={leading === 'close' ? 'close' : 'back'} size={24} />
        </button>
        <span className="app-bar-title">{title}</span>
        {step && <span className="app-bar-step num">{step.current} / {step.total}</span>}
        {trailing}
      </div>
      {step && (
        <div className="progress app-bar-progress" aria-hidden>
          {Array.from({ length: step.total }, (_, i) => <span key={i} className={i < step.current ? 'on' : ''} />)}
        </div>
      )}
    </header>
  )
}

export function BottomActionBar({ children }: { children: ReactNode }) {
  return <div className="bottom-bar">{children}</div>
}

/** The lock mark of a Confirmação necessária note. */
export function LockIcon() {
  return <Icon name="lock" size={18} className="lock-note-icon" />
}
