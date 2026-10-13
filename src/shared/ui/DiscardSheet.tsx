import { BottomSheet } from './BottomSheet'

// Asked before unsaved data is thrown away (app bar, Android/browser back, any navigation away — see useFlow).
// "Continuar a editar" is the safe default (focused; also what Escape and the backdrop do); "Descartar" is destructive.
export function DiscardSheet({ open = true, title, detail = 'Nada foi registado.', onDiscard, onKeep }: {
  open?: boolean; title: string; detail?: string; onDiscard: () => void; onKeep: () => void
}) {
  if (!open) return null
  return (
    <BottomSheet labelledBy="discard-title" onDismiss={onKeep}>
      <h2 id="discard-title" className="sheet-title">{title}</h2>
      <p className="muted" style={{ margin: 0 }}>{detail}</p>
      <button className="btn btn-primary" data-autofocus onClick={onKeep}>Continuar a editar</button>
      <button className="btn btn-destructive" onClick={onDiscard}>Descartar</button>
    </BottomSheet>
  )
}
