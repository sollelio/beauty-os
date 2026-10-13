import { ConfirmDialog } from './ConfirmDialog'

// Asked before unsaved data is thrown away (app bar, Android/browser back, any navigation away — see useFlow).
// "Continuar a editar" is the safe default (focused; also what Escape and the backdrop do); "Descartar" is destructive.
export function DiscardSheet({ open = true, title, detail = 'Nada foi registado.', onDiscard, onKeep }: {
  open?: boolean; title: string; detail?: string; onDiscard: () => void; onKeep: () => void
}) {
  if (!open) return null
  return (
    <ConfirmDialog title={title} safeLabel="Continuar a editar" destructiveLabel="Descartar" onSafe={onKeep} onDestructive={onDiscard}>
      {detail}
    </ConfirmDialog>
  )
}
