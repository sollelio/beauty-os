// Mobile app shell (UX foundation slice): a full-height screen with a sticky app bar, a scrolling body and an optional
// bottom action bar that keeps the primary action in the thumb zone (above the keyboard where the browser resizes the
// viewport for it, and clear of the bottom safe area). No brand identity here: tokens from base.css only.
import type { ReactNode } from 'react'

export function AppScreen({ bar, actions, children }: { bar?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="app-screen">
      {bar}
      <main className="app-screen-body">{children}</main>
      {actions}
    </div>
  )
}

const icon = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const

/** `close` (×) leaves a task; `back` (←) returns one level. `step` turns it into the flow variant: count and progress. */
export function AppBar({ title, leading, onLeading, step }: {
  title: string; leading: 'back' | 'close'; onLeading: () => void; step?: { current: number; total: number }
}) {
  return (
    <header className="app-bar">
      <div className="app-bar-row">
        <button className="app-bar-btn" aria-label={leading === 'close' ? 'Fechar' : 'Voltar'} onClick={onLeading}>
          {leading === 'close'
            ? <svg {...icon}><path d="M6 6l12 12M18 6 6 18" /></svg>
            : <svg {...icon}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>}
        </button>
        <span className="app-bar-title">{title}</span>
        {step && <span className="app-bar-step num">{step.current} / {step.total}</span>}
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

/** The lock mark of a Confirmação necessária note (replaces the 🔒 emoji). */
export function LockIcon() {
  return <svg {...icon} width={18} height={18} style={{ flex: '0 0 auto', marginTop: '0.0625rem' }}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
}
