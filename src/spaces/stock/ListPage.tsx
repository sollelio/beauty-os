// Preparar compra · Lista de compra (Slice 05 K3): the plan, never a record. Membership, planned quantity and urgency
// are the products' plan fields (server, shared by the salon); "Marcados «baixo»" are suggested, never auto-added.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createProduct, getStockOverview, LEVEL_LABEL, stockKeys, updateStock, type StockEdit, type StockProduct } from '../../modules/stock/api'
import { ProductPicker } from '../../modules/stock/ProductPicker'
import type { PickedProduct } from '../../modules/stock/trip'

function listContext(p: StockProduct): string {
  const rest = [...(p.level ? [LEVEL_LABEL[p.level].toLocaleLowerCase('pt-PT')] : []), ...(p.reserve_units > 0 ? [`${p.reserve_units} em reserva`] : [])]
  return [
    ...(rest.length ? [`resta: ${rest.join(' · ')}`] : []),
    ...(p.last_purchase ? [`última: ${p.last_purchase.quantity} ${p.last_purchase.unit_word}`] : []),
  ].join(' · ')
}

export function ListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const overview = useQuery({ queryKey: stockKeys.overview, queryFn: getStockOverview })
  const [adding, setAdding] = useState(false)
  const [failed, setFailed] = useState(false)

  const all = overview.data ?? []
  const listed = all.filter((p) => p.on_list)
  const urgent = listed.filter((p) => p.urgent)
  const month = listed.filter((p) => !p.urgent)
  const suggested = all.filter((p) => !p.on_list && p.state === 'baixo')

  async function edit(p: StockProduct, e: StockEdit) {
    setFailed(false)
    qc.setQueryData<StockProduct[]>(stockKeys.overview, (rows) => rows?.map((r) => (r.id === p.id ? { ...r, ...e } : r)))
    try { await updateStock(p.id, e) } catch { setFailed(true) }
    await qc.invalidateQueries({ queryKey: stockKeys.overview })
  }
  async function addOther(pick: PickedProduct) {
    setAdding(false); setFailed(false)
    try {
      const id = pick.productId ?? await createProduct(pick.name, pick.unitWord)
      await updateStock(id, { on_list: true })
    } catch { setFailed(true) }
    await qc.invalidateQueries({ queryKey: ['stock'] })
  }

  const entry = (p: StockProduct) => (
    <div key={p.id} className="plan-row">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <span className="grow"><strong style={{ display: 'block' }}>{p.name}</strong><span className="muted" style={{ fontSize: '0.875rem' }}>{listContext(p)}</span></span>
        <button className="icon-btn" aria-label={`Tirar ${p.name} da lista`} onClick={() => edit(p, { on_list: false, urgent: false, planned_qty: null })}>×</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span className="muted grow">Levar</span>
        <button className="step" aria-label={`Menos ${p.name}`} onClick={() => edit(p, { planned_qty: Math.max(1, (p.planned_qty ?? 1) - 1) })}>−</button>
        <span className="num stepper-value" style={{ minWidth: '5.5rem' }}>{p.planned_qty ?? 1} {p.unit_word}</span>
        <button className="step" aria-label={`Mais ${p.name}`} onClick={() => edit(p, { planned_qty: Math.min(9999, (p.planned_qty ?? 1) + 1) })}>+</button>
      </div>
    </div>
  )

  return (
    <main className="app-main">
      <header className="flow-header-row">
        <button className="icon-btn" aria-label="Voltar" onClick={() => navigate('/stock')}>←</button>
        <span className="muted" style={{ fontWeight: 600 }}>Preparar compra</span><span style={{ width: '2.75rem' }} />
      </header>
      <section className="stack">
        <h1 style={{ fontSize: '1.625rem' }}>Lista de compra</h1>
        <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>Um plano para levar ao mercado. A compra real regista-se depois, com o que comprou de facto.</p>
      </section>
      {failed && <div className="notice notice-error" role="alert">Não foi possível guardar a alteração. Tente novamente.</div>}
      {urgent.length > 0 && <section className="stack" style={{ gap: 0 }}><span className="label">Urgente · comprar já</span>{urgent.map(entry)}</section>}
      <section className="stack" style={{ gap: 0 }}>
        <span className="label">Compra do mês</span>
        {month.length === 0 && <p className="muted" style={{ margin: '0.5rem 0 0' }}>Nada na lista. Adicione produtos abaixo.</p>}
        {month.map(entry)}
      </section>
      {suggested.length > 0 && (
        <section className="stack" style={{ gap: 0 }}>
          <span className="label">Marcados «baixo» · juntar?</span>
          {suggested.map((p) => (
            <div key={p.id} className="list-row">
              <span className="grow"><strong style={{ display: 'block' }}>{p.name}</strong><span className="muted" style={{ fontSize: '0.875rem' }}>{listContext(p)}</span></span>
              <button className="chip chip-outline" aria-label={`Juntar ${p.name}`} onClick={() => edit(p, { on_list: true })}>+ Juntar</button>
            </div>
          ))}
        </section>
      )}
      <button className="btn btn-secondary btn-dashed" onClick={() => setAdding(true)}>+ Outro produto</button>
      <div className="footer">
        <span className="muted" style={{ textAlign: 'center' }}>
          {listed.length === 0 ? 'Lista vazia.' : `${listed.length} ${listed.length === 1 ? 'produto' : 'produtos'}${urgent.length ? ` · ${urgent.length} ${urgent.length === 1 ? 'urgente' : 'urgentes'}` : ''}`}
        </span>
        <button className="btn btn-primary btn-tall" disabled={listed.length === 0} onClick={() => navigate('/stock/mercado')}>Ir às compras</button>
      </div>
      {adding && <ProductPicker title="Juntar à lista" products={all} exclude={listed.map((p) => p.id)} onPick={addOther} onClose={() => setAdding(false)} />}
    </main>
  )
}
