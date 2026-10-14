// Preparar compra · Lista de compra (Slice 05 K3): the plan, never a record. Membership, planned quantity and urgency
// are the products' plan fields (server, shared by the salon); "Marcados «baixo»" are suggested, never auto-added.
// On the mobile shell: each entry is a whole tappable row (its sheet holds "Tirar da lista", a deliberate, undoable
// removal — no small × on the row); the "Levar" stepper stays one tap under it; "Ir às compras" in the bottom bar.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createProduct, getStockOverview, LEVEL_LABEL, stockKeys, updateStock, type StockEdit, type StockProduct } from '../../modules/stock/api'
import { ProductPicker } from '../../modules/stock/ProductPicker'
import type { PickedProduct } from '../../modules/stock/trip'
import { AppBar, AppScreen, BottomActionBar } from '../../shared/ui/AppShell'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack, useSheet } from '../../shared/ui/navigation'
import { EmptyState, ErrorState, Skeleton } from '../../shared/ui/states'

function listContext(p: StockProduct): string {
  const rest = [...(p.level ? [LEVEL_LABEL[p.level].toLocaleLowerCase('pt-PT')] : []), ...(p.reserve_units > 0 ? [`${p.reserve_units} em reserva`] : [])]
  return [
    ...(rest.length ? [`resta: ${rest.join(' · ')}`] : []),
    ...(p.last_purchase ? [`última: ${p.last_purchase.quantity} ${p.last_purchase.unit_word}`] : []),
  ].join(' · ')
}

type Sheet = { kind: 'item'; id: string } | { kind: 'add' }
type Removed = { product: StockProduct; restore: StockEdit }

export function ListPage() {
  const navigate = useNavigate()
  const back = useAppBack('/stock')
  const qc = useQueryClient()
  const overview = useQuery({ queryKey: stockKeys.overview, queryFn: getStockOverview })
  const sheets = useSheet<Sheet>()
  const sheet = sheets.current
  const [failed, setFailed] = useState(false)
  const [removed, setRemoved] = useState<Removed | null>(null)

  const all = overview.data ?? []
  const listed = all.filter((p) => p.on_list)
  const urgent = listed.filter((p) => p.urgent)
  const month = listed.filter((p) => !p.urgent)
  const suggested = all.filter((p) => !p.on_list && p.state === 'baixo')
  const item = sheet?.kind === 'item' ? all.find((p) => p.id === sheet.id) ?? null : null

  async function edit(p: StockProduct, e: StockEdit) {
    setFailed(false)
    qc.setQueryData<StockProduct[]>(stockKeys.overview, (rows) => rows?.map((r) => (r.id === p.id ? { ...r, ...e } : r)))
    try { await updateStock(p.id, e) } catch { setFailed(true) }
    await qc.invalidateQueries({ queryKey: stockKeys.overview })
  }
  // Tirar da lista: the plan fields go; Desfazer puts back exactly what the entry had (membership, quantity, urgency).
  function remove(p: StockProduct) {
    setRemoved({ product: p, restore: { on_list: true, planned_qty: p.planned_qty, urgent: p.urgent } })
    sheets.close()
    void edit(p, { on_list: false, urgent: false, planned_qty: null })
  }
  function undo() {
    if (!removed) return
    setRemoved(null)
    void edit(removed.product, removed.restore)
  }
  async function addOther(pick: PickedProduct) {
    sheets.close(); setFailed(false); setRemoved(null)
    try {
      const id = pick.productId ?? await createProduct(pick.name, pick.unitWord)
      await updateStock(id, { on_list: true })
    } catch { setFailed(true) }
    await qc.invalidateQueries({ queryKey: ['stock'] })
  }

  const entry = (p: StockProduct) => (
    <div key={p.id} className="plan-item">
      <ListRow as="button" onClick={() => { setRemoved(null); sheets.open({ kind: 'item', id: p.id }) }} title={p.name} subtitle={listContext(p) || undefined} chevron />
      <div className="plan-stepper">
        <span className="support grow">Levar</span>
        <span className="stepper">
          <button className="step" aria-label={`Menos ${p.name}`} onClick={() => edit(p, { planned_qty: Math.max(1, (p.planned_qty ?? 1) - 1) })}><Icon name="minus" /></button>
          <span className="num stepper-value">{p.planned_qty ?? 1} {p.unit_word}</span>
          <button className="step" aria-label={`Mais ${p.name}`} onClick={() => edit(p, { planned_qty: Math.min(9999, (p.planned_qty ?? 1) + 1) })}><Icon name="plus" /></button>
        </span>
      </div>
    </div>
  )

  return (
    <AppScreen
      bar={<AppBar title="Lista de compra" leading="back" onLeading={back} />}
      actions={
        <BottomActionBar>
          <span className="bar-summary">
            {!overview.isSuccess ? '' : listed.length === 0 ? 'Lista vazia.' : `${listed.length} ${listed.length === 1 ? 'produto' : 'produtos'}${urgent.length ? ` · ${urgent.length} ${urgent.length === 1 ? 'urgente' : 'urgentes'}` : ''}`}
          </span>
          <button className="btn btn-primary btn-tall" disabled={listed.length === 0} onClick={() => navigate('/stock/mercado')}>Ir às compras</button>
        </BottomActionBar>
      }>
      <p className="note support">Um plano para levar ao mercado. A compra real regista-se depois, com o que comprou de facto.</p>
      {failed && <ErrorState>Não foi possível guardar a alteração. Tente novamente.</ErrorState>}
      {removed && (
        <div className="notice notice-success row-between" role="status">
          <span>{removed.product.name} saiu da lista.</span>
          <button type="button" className="link-btn" onClick={undo}>Desfazer</button>
        </div>
      )}
      {overview.isPending && <Skeleton rows={3} />}
      {overview.isError && <ErrorState onRetry={() => overview.refetch()}>Não foi possível carregar a lista de compra.</ErrorState>}
      {overview.isSuccess && urgent.length > 0 && <section className="stack"><span className="label">Urgente · comprar já</span><ListGroup>{urgent.map(entry)}</ListGroup></section>}
      {overview.isSuccess && (
        <section className="stack">
          <span className="label">Compra do mês</span>
          {month.length === 0 ? <EmptyState icon="box" title="Nada na lista">Adicione produtos abaixo, ou marque-os «Comprar» no Stock.</EmptyState> : <ListGroup>{month.map(entry)}</ListGroup>}
        </section>
      )}
      {overview.isSuccess && suggested.length > 0 && (
        <section className="stack">
          <span className="label">Marcados «baixo» · juntar?</span>
          <ListGroup>
            {suggested.map((p) => (
              <ListRow key={p.id} as="button" aria-label={`Juntar ${p.name}`} onClick={() => { setRemoved(null); void edit(p, { on_list: true }) }} title={p.name}
                subtitle={listContext(p) || undefined} trailing={<span className="row-accent group-label"><Icon name="plus" size={18} />Juntar</span>} />
            ))}
          </ListGroup>
        </section>
      )}
      {overview.isSuccess && (
        <button className="btn btn-secondary btn-dashed" onClick={() => { setRemoved(null); sheets.open({ kind: 'add' }) }}><Icon name="plus" />Outro produto</button>
      )}

      {sheet?.kind === 'item' && item && (
        <BottomSheet labelledBy="item-title" onDismiss={sheets.close}>
          <div className="row-between">
            <span className="stack stack-tight">
              <h2 id="item-title" className="sheet-title">{item.name}</h2>
              {listContext(item) && <span className="support">{listContext(item)}</span>}
            </span>
            <button className="icon-btn" aria-label="Fechar" onClick={sheets.close}><Icon name="close" /></button>
          </div>
          <div className="row-between">
            <span className="row-title">Levar</span>
            <span className="stepper">
              <button className="step" aria-label={`Menos ${item.name}`} onClick={() => edit(item, { planned_qty: Math.max(1, (item.planned_qty ?? 1) - 1) })}><Icon name="minus" /></button>
              <span className="num stepper-value">{item.planned_qty ?? 1} {item.unit_word}</span>
              <button className="step" aria-label={`Mais ${item.name}`} onClick={() => edit(item, { planned_qty: Math.min(9999, (item.planned_qty ?? 1) + 1) })}><Icon name="plus" /></button>
            </span>
          </div>
          <p className="note support">Tirar da lista não muda o estado marcado em Stock.</p>
          <button className="btn btn-secondary" data-autofocus onClick={sheets.close}>OK</button>
          <button className="btn btn-destructive" onClick={() => remove(item)}>Tirar da lista</button>
        </BottomSheet>
      )}
      {sheet?.kind === 'add' && (
        <ProductPicker title="Juntar à lista" products={all} exclude={listed.map((p) => p.id)} onPick={addOther} onClose={sheets.close} />
      )}
    </AppScreen>
  )
}
