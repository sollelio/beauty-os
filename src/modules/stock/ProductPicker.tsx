// Search-or-type sheet shared by Stock's list, substitution and unplanned-item sheets (Slice 05 K5), following the
// Slice 03 add sheet: matches by name; "Criar produto novo: «nome»" only when no product has that name; a new
// product needs a unit word. A BottomSheet: the caller gives it its history entry (useSheet), so back closes it.
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listUnitWords, stockKeys, type Product } from './api'
import type { PickedProduct } from './trip'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { Field } from '../../shared/ui/Field'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow, RowIcon } from '../../shared/ui/ListRow'
import { Skeleton } from '../../shared/ui/states'

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
    <BottomSheet labelledBy="picker-title" onDismiss={onClose}>
      <div className="row-between">
        <span className="stack stack-tight">
          <h2 id="picker-title" className="sheet-title">{title}</h2>
          {subtitle && <span className="support">{subtitle}</span>}
        </span>
        <button className="icon-btn" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
      </div>
      {creating === null ? (
        <>
          <Field label="Procurar ou escrever produto" hideLabel leading={<Icon name="search" />}>
            <input type="search" enterKeyHint="search" data-autofocus placeholder="Procurar ou escrever produto" value={query} onChange={(e) => setQuery(e.target.value)} />
          </Field>
          {(matches.length > 0 || (q.length >= 2 && !exists)) && (
            <ListGroup>
              {matches.map((p) => (
                <ListRow key={p.id} as="button" title={p.name} trailing={<span className="muted">{p.unit_word}</span>}
                  onClick={() => onPick({ productId: p.id, name: p.name, unitWord: p.unit_word })} />
              ))}
              {q.length >= 2 && !exists && (
                <ListRow as="button" leading={<RowIcon name="plus" />} title={<span className="row-accent">Criar produto novo: «{q}»</span>}
                  subtitle="produto novo" onClick={() => setCreating(q)} />
              )}
            </ListGroup>
          )}
          {q && matches.length === 0 && <span className="support">Sem resultados para «{q}».</span>}
        </>
      ) : (
        <div className="stack">
          <span className="row-title">{creating}</span>
          <span className="label">Unidade</span>
          {units.isPending ? <Skeleton rows={1} /> : (
            <div className="wrap" role="group" aria-label="Unidade">
              {units.data?.map((w) => (
                <button key={w} type="button" className="chip chip-outline" onClick={() => onPick({ productId: null, name: creating, unitWord: w })}>{w}</button>
              ))}
            </div>
          )}
          <button className="link-btn self-start" onClick={() => setCreating(null)}><Icon name="back" size={18} />Voltar</button>
        </div>
      )}
      {note && <p className="note support">{note}</p>}
    </BottomSheet>
  )
}
