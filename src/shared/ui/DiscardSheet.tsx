export function DiscardSheet({ title, onDiscard, onKeep }: { title: string; onDiscard: () => void; onKeep: () => void }) {
  return (
    <div className="sheet" role="dialog" aria-labelledby="discard-title">
      <div className="sheet-body">
        <h2 id="discard-title" style={{ fontSize: '1.25rem' }}>{title}</h2>
        <p className="muted" style={{ margin: 0 }}>Nada foi registado.</p>
        <button className="btn btn-primary" onClick={onDiscard}>Descartar</button>
        <button className="btn btn-secondary" onClick={onKeep}>Continuar a editar</button>
      </div>
    </div>
  )
}
