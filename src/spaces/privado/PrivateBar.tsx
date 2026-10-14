// Private-mode chrome (UX slice 7): every screen of the private area carries the same bar — tinted, "Área privada ·
// <who is operating>" on its own line, the section as the title — so the person always knows they are inside it.
// Inside the area, ← goes back in its own history; the area's root shows × instead, which is the explicit exit, and
// every other screen offers "Sair" at the end of the bar (except decision flows, where ← and the flow's own guard lead).
// Leaving ends the context (07 §8): the same exitPrivateContext as before; the database stays the boundary.
import type { ReactNode } from 'react'
import { useOutletContext } from 'react-router'
import type { PrivateStatus } from '../../modules/org/privateContext'
import { AppBar } from '../../shared/ui/AppShell'
import { Icon } from '../../shared/ui/Icon'
import { usePrivateExit } from './usePrivateExit'

export function PrivateBar({ title, onBack, root, step, actions, exit = true }: {
  title: string; onBack?: () => void; root?: boolean; step?: { current: number; total: number }; actions?: ReactNode; exit?: boolean
}) {
  // Optional: the entry page and isolated screens render outside the gate's outlet.
  const ctx = useOutletContext<Extract<PrivateStatus, { active: true }> | undefined>()
  const leave = usePrivateExit()
  const who = ctx?.active ? ctx.display_name : null
  return (
    <AppBar tone="private" title={title} step={step}
      overline={<><Icon name="lock" size={14} strokeWidth={2.5} /><span>Área privada{who ? ` · ${who}` : ''}</span></>}
      leading={root ? 'close' : 'back'} leadingLabel={root ? 'Sair da área privada' : undefined} onLeading={root ? leave : onBack ?? leave}
      trailing={(actions || (!root && exit)) && <>
        {actions}
        {!root && exit && <button type="button" className="app-bar-text-btn" aria-label="Sair da área privada" onClick={leave}>Sair</button>}
      </>} />
  )
}
