// A decision before something is thrown away or undone: title, one line of consequence, the safe action first
// (primary, focused; also what Escape and the backdrop do) and the destructive one last. Built on BottomSheet; the
// caller gives it a history entry (useSheet) or a held navigation (useFlow), so Android/browser back = the safe action.
import { useId, type ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'

export function ConfirmDialog({ title, children, safeLabel, destructiveLabel, onSafe, onDestructive }: {
  title: string; children: ReactNode; safeLabel: string; destructiveLabel: string; onSafe: () => void; onDestructive: () => void
}) {
  const id = useId()
  return (
    <BottomSheet labelledBy={id} onDismiss={onSafe}>
      <h2 id={id} className="sheet-title">{title}</h2>
      <p className="muted" style={{ margin: 0 }}>{children}</p>
      <button className="btn btn-primary" data-autofocus onClick={onSafe}>{safeLabel}</button>
      <button className="btn btn-destructive" onClick={onDestructive}>{destructiveLabel}</button>
    </BottomSheet>
  )
}
