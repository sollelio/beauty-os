// Rever stock (Slice 05 K7b): optional, after a Stock-originated purchase. Each product shows the state it has now;
// tapping is the same human action as in the product sheet. Nothing changes by itself; Concluir is always enabled.
// On the mobile shell: one block per product (what was bought, the state as three segments), "Guardado" after each save,
// a visible, retryable failure, Concluir in the bottom bar replacing this screen with Stock (the task is over).
// The lines come from the purchase screen as router state (kept by the browser across a reload of this screen).
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getStockOverview, STATE_LABEL, stockKeys, updateStock, type StockProduct, type StockState } from '../../modules/stock/api'
import { AppBar, AppScreen, BottomActionBar } from '../../shared/ui/AppShell'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup } from '../../shared/ui/ListRow'
import { useAppBack } from '../../shared/ui/navigation'
import { SegmentedControl } from '../../shared/ui/SegmentedControl'
import { EmptyState, ErrorState, Skeleton } from '../../shared/ui/states'

export type ReviewLine = { name: string; quantity: number; unitWord: string; insteadOf: string | null }
const STATES = (['ok', 'baixo', 'comprar'] as StockState[]).map((s) => ({ id: s, label: STATE_LABEL[s] }))

export function ReviewPage() {
  const navigate = useNavigate()
  const back = useAppBack('/stock')
  const qc = useQueryClient()
  const lines = ((useLocation().state as { lines?: ReviewLine[] } | null)?.lines) ?? []
  const overview = useQuery({ queryKey: stockKeys.overview, queryFn: getStockOverview })
  const [failed, setFailed] = useState<{ product: StockProduct; state: StockState } | null>(null)
  const [saved, setSaved] = useState<Record<string, StockState>>({})
  const lower = (s: string) => s.trim().toLocaleLowerCase('pt-PT')
  const rows = lines.flatMap((l) => {
    const p = overview.data?.find((x) => lower(x.name) === lower(l.name))
    return p ? [{ line: l, product: p }] : []
  })
  const stillMarked = rows.filter((r) => r.product.state !== 'ok').length

  // Optimistic, then the refetch tells the truth: a failed save shows the state as it still is on the server, and says so.
  async function setState(p: StockProduct, state: StockState) {
    setFailed(null)
    setSaved((m) => Object.fromEntries(Object.entries(m).filter(([id]) => id !== p.id)))
    qc.setQueryData<StockProduct[]>(stockKeys.overview, (all) => all?.map((x) => (x.id === p.id ? { ...x, state } : x)))
    try {
      await updateStock(p.id, { state })
      setSaved((m) => ({ ...m, [p.id]: state }))
    } catch { setFailed({ product: p, state }) } finally { await qc.invalidateQueries({ queryKey: ['stock'] }) }
  }

  return (
    <AppScreen
      bar={<AppBar title="Rever stock" leading="back" onLeading={back} />}
      actions={
        <BottomActionBar>
          {overview.data && rows.length > 0 && (
            <span className="bar-summary" data-testid="review-summary">
              {stillMarked === 0 ? 'Todos marcados OK por si.'
                : `${stillMarked} ${stillMarked === 1 ? 'produto continua marcado' : 'produtos continuam marcados'} «Baixo» ou «Comprar» — como estava antes da compra.`}
            </span>
          )}
          <button className="btn btn-primary btn-tall" onClick={() => navigate('/stock', { replace: true })}>Concluir</button>
        </BottomActionBar>
      }>
      <p className="note">Opcional. Cada produto mostra o estado que tem agora; toque só no que quer mudar. Nada muda sozinho.</p>
      {overview.isPending && <Skeleton rows={2} />}
      {overview.isError && <ErrorState onRetry={() => overview.refetch()}>Não foi possível carregar o Stock.</ErrorState>}
      {overview.isSuccess && rows.length === 0 && (
        <EmptyState icon="box" title="Nada para rever">
          {lines.length === 0 ? 'Esta revisão abre a seguir a uma compra feita a partir do Stock.' : 'Os produtos desta compra já não constam do Stock.'}
        </EmptyState>
      )}
      {failed && (
        <ErrorState onRetry={() => setState(failed.product, failed.state)}>
          Não foi possível guardar «{STATE_LABEL[failed.state]}» em {failed.product.name}. O estado ficou como estava.
        </ErrorState>
      )}
      {rows.length > 0 && (
        <ListGroup>
          {rows.map(({ line, product }) => (
            <section key={product.id} className="row-block" aria-label={product.name}>
              <span className="row-body">
                <span className="row-title">{product.name}</span>
                <span className="row-subtitle">comprado hoje · {line.quantity} {line.unitWord}{line.insteadOf ? ` · em vez de ${line.insteadOf}` : ''}</span>
              </span>
              <SegmentedControl label={`Estado de ${product.name}`} hideLabel options={STATES} value={product.state} onChange={(s) => setState(product, s as StockState)} />
              <span className="support" aria-live="polite">
                {saved[product.id] && <span className="saved-line"><Icon name="check" size={16} strokeWidth={2.5} />Guardado · {STATE_LABEL[saved[product.id]!]}</span>}
              </span>
            </section>
          ))}
        </ListGroup>
      )}
    </AppScreen>
  )
}
