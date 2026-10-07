// Search-or-type sheet shared by Stock's list, substitution and unplanned-item sheets (Slice 05 K5), following the
// Slice 03 add sheet: matches by name; "Criar produto novo: «nome»" only when no product has that name; a new
// product needs a unit word.
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listUnitWords, stockKeys, type Product } from './api'
import type { PickedProduct } from './trip'

export function ProductPicker({ title, subtitle, products, exclude = [], note, onPick, onClose }: {
  title: string; subtitle?: string; products: Product[]; exclude?: string[]; note?: ReactNode
  onPick: (p: PickedProduct) => void; onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState<string | null>(null)
  const units = useQuery({ queryKey: stockKeys.unitWords, queryFn: listUnitWords })
  const q = query.trim()
  const lower = (s: string) => s.toLocaleLowerCase('pt-PT')
  const matches = products.filter((p) => !exclude.includes(p.id) && (!q || lower(p.name).includes(lower(q))))
  const exists = products.some((p) => lower(p.name) === lower(q))

  return (
    <div className="sheet" role="dialog" aria-labelledby="picker-title" onClick={onClose}>
      <div className="sheet-body" style={{ maxHeight: '88dvh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="flow-header-row">
          <span><h2 id="picker-title" style={{ fontSize: '1.25rem' }}>{title}</h2>{subtitle && <span className="muted" style={{ fontSize: '0.875rem' }}>{subtitle}</span>}</span>
          <button className="icon-btn" aria-label="Fechar" onClick={onClose}>×</button>
        </div>
        {creating === null ? (
          <>
            <label className="field"><input type="search" aria-label="Procurar ou escrever produto" placeholder="Procurar ou escrever produto" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
            <div className="stack">
              {matches.map((p) => (
                <button key={p.id} className="pick" onClick={() => onPick({ productId: p.id, name: p.name, unitWord: p.unit_word })}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span><span className="muted">{p.unit_word}</span>
                </button>
              ))}
              {q.length >= 2 && !exists && (
                <button className="pick" style={{ borderStyle: 'dashed' }} onClick={() => setCreating(q)}>
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>Criar produto novo: «{q}»</span><span className="muted">produto novo</span>
                </button>
              )}
              {q && matches.length === 0 && <span className="muted">Sem resultados para «{q}».</span>}
            </div>
          </>
        ) : (
          <div className="stack">
            <strong>{creating}</strong>
            <span className="label">Unidade</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {units.data?.map((w) => (
                <button key={w} className="seg" style={{ flex: '0 0 auto', padding: '0 1rem' }} onClick={() => onPick({ productId: null, name: creating, unitWord: w })}>{w}</button>
              ))}
            </div>
            <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setCreating(null)}>Voltar</button>
          </div>
        )}
        {note && <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>{note}</p>}
      </div>
    </div>
  )
}
