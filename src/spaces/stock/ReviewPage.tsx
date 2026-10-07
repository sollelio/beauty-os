// Rever stock (Slice 05 K7b): optional, after a Stock-originated purchase. Each product shows the state it has now;
// tapping is the same human action as in the product sheet. Nothing changes by itself; Concluir is always enabled.
import { useLocation, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getStockOverview, STATE_LABEL, stockKeys, updateStock, type StockProduct, type StockState } from '../../modules/stock/api'

export type ReviewLine = { name: string; quantity: number; unitWord: string; insteadOf: string | null }

export function ReviewPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const lines = ((useLocation().state as { lines?: ReviewLine[] } | null)?.lines) ?? []
  const overview = useQuery({ queryKey: stockKeys.overview, queryFn: getStockOverview })
  const lower = (s: string) => s.trim().toLocaleLowerCase('pt-PT')
  const rows = lines.flatMap((l) => {
    const p = overview.data?.find((x) => lower(x.name) === lower(l.name))
    return p ? [{ line: l, product: p }] : []
  })
  const stillMarked = rows.filter((r) => r.product.state !== 'ok').length

  async function setState(p: StockProduct, state: StockState) {
    qc.setQueryData<StockProduct[]>(stockKeys.overview, (all) => all?.map((x) => (x.id === p.id ? { ...x, state } : x)))
    try { await updateStock(p.id, { state }) } finally { await qc.invalidateQueries({ queryKey: ['stock'] }) }
  }

  return (
    <main className="app-main">
      <header className="flow-header-row">
        <button className="icon-btn" aria-label="Voltar" onClick={() => navigate('/stock')}>←</button>
        <span className="muted" style={{ fontWeight: 600 }}>Stock</span><span style={{ width: '2.75rem' }} />
      </header>
      <section className="stack">
        <h1 style={{ fontSize: '1.625rem' }}>Rever stock</h1>
        <p className="muted" style={{ margin: 0 }}>Opcional. Cada produto mostra o estado que tem agora; toque só no que quer mudar. Nada muda sozinho.</p>
      </section>
      {rows.map(({ line, product }) => (
        <section key={product.id} className="stack plan-row">
          <span><strong style={{ display: 'block' }}>{product.name}</strong>
            <span className="muted" style={{ fontSize: '0.875rem' }}>comprado hoje · {line.quantity} {line.unitWord}{line.insteadOf ? ` · em vez de ${line.insteadOf}` : ''}</span></span>
          <div className="segmented" role="group" aria-label={`Estado de ${product.name}`}>
            {(['ok', 'baixo', 'comprar'] as StockState[]).map((s) => <button key={s} className="seg" aria-pressed={product.state === s} onClick={() => setState(product, s)}>{STATE_LABEL[s]}</button>)}
          </div>
        </section>
      ))}
      <div className="footer">
        {overview.data && (
          <span className="muted" style={{ textAlign: 'center', fontSize: '0.875rem' }} data-testid="review-summary">
            {stillMarked === 0 ? 'Todos marcados OK por si.'
              : `${stillMarked} ${stillMarked === 1 ? 'produto continua marcado' : 'produtos continuam marcados'} «Baixo» ou «Comprar» — como estava antes da compra.`}
          </span>
        )}
        <button className="btn btn-primary btn-tall" onClick={() => navigate('/stock')}>Concluir</button>
      </div>
    </main>
  )
}
