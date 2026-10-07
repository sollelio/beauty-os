// Modo mercado (Slice 05 K4/K5) and Passagem (K6). The trip is a local draft rebuilt from the current list on each
// entry, keeping progress; checking items records nothing. The real purchase is the Slice 03 flow.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { getStockOverview, stockKeys, type StockProduct } from '../../modules/stock/api'
import { ProductPicker } from '../../modules/stock/ProductPicker'
import {
  addUnplanned, boughtItems, buildTrip, clearTrip, isSubstituted, loadTrip, removeUnplanned, revertSubstitute, saveTrip,
  setQty, skip, substitute, toggle, tripCounts, type PickedProduct, type Trip, type TripItem,
} from '../../modules/stock/trip'

type Sheet = null | { kind: 'options'; key: string } | { kind: 'substitute'; key: string } | { kind: 'unplanned' } | { kind: 'unplanned-qty'; pick: PickedProduct; qty: number }

export function MarketPage() {
  const overview = useQuery({ queryKey: stockKeys.overview, queryFn: getStockOverview })
  if (!overview.data) return <main className="app-main"><p className="muted">A carregar…</p></main>
  return <MarketTrip products={overview.data} />
}

function MarketTrip({ products }: { products: StockProduct[] }) {
  const org = useOrganization()
  const navigate = useNavigate()
  // Rebuilt from the current list on entry, keeping progress from the stored draft.
  const [trip, setTrip] = useState<Trip>(() => { const t = buildTrip(products, loadTrip(org.id)); saveTrip(org.id, t); return t })
  const [sheet, setSheet] = useState<Sheet>(null)
  const update = (t: Trip) => { saveTrip(org.id, t); setTrip(t) }
  const c = tripCounts(trip)
  const item = sheet && 'key' in sheet ? trip.items.find((i) => i.key === sheet.key) : undefined
  const groups = [
    { label: 'Urgente · comprar já', items: trip.items.filter((i) => i.urgent) },
    { label: 'Compra do mês', items: trip.items.filter((i) => !i.urgent) },
  ].filter((g) => g.items.length > 0)
  const sub = (i: TripItem) => (isSubstituted(i) ? `em vez de ${i.plannedName}` : i.unplanned ? 'não planeado' : i.status === 'skipped' ? 'não comprei' : null)

  return (
    <main className="app-main">
      <header className="flow-header-row">
        <button className="icon-btn" aria-label="Voltar" onClick={() => navigate('/stock/lista')}>←</button>
        <span className="muted" style={{ fontWeight: 600 }}>Compras</span>
        <span className="label num" data-testid="progress">{c.progress}</span>
      </header>
      {trip.items.length === 0 && <p className="muted" style={{ margin: 0 }}>Lista vazia.</p>}
      {trip.items.length > 0 && c.bought === 0 && <p className="muted" style={{ margin: 0 }}>Marque o que vai comprando.</p>}
      {groups.map((g) => (
        <section key={g.label} className="stack" style={{ gap: 0 }}>
          <span className="label">{g.label}</span>
          {g.items.map((i) => (
            <div key={i.key} className={`market-row${i.status === 'skipped' ? ' skipped' : ''}`}>
              <button className={`check${i.status === 'bought' ? ' on' : ''}`} aria-pressed={i.status === 'bought'} aria-label={`Comprado: ${i.name}`} onClick={() => update(toggle(trip, i.key))}>{i.status === 'bought' ? '✓' : ''}</button>
              <span className="grow"><span className="market-name">{i.name}</span>{sub(i) && <span className="muted" style={{ display: 'block', fontSize: '0.875rem' }}>{sub(i)}</span>}</span>
              <span className="num market-qty">{i.qty} {i.unitWord}</span>
              <button className="icon-btn" aria-label={`Opções: ${i.name}`} onClick={() => setSheet({ kind: 'options', key: i.key })}>⋯</button>
            </div>
          ))}
        </section>
      ))}
      <button className="btn btn-secondary btn-dashed" onClick={() => setSheet({ kind: 'unplanned' })}>+ Item não planeado</button>
      <div className="footer">
        <span className="muted num" style={{ textAlign: 'center' }} data-testid="trip-summary">
          {c.bought} {c.bought === 1 ? 'comprado' : 'comprados'} · {c.pending} por comprar · {c.skipped} não comprei
        </span>
        {c.bought > 0
          ? <button className="btn btn-primary btn-tall" onClick={() => navigate('/stock/passagem')}>Terminar e registar compra</button>
          : <button className="btn btn-secondary" onClick={() => { clearTrip(org.id); navigate('/stock') }}>Terminar sem compra</button>}
      </div>

      {sheet?.kind === 'options' && item && (
        <div className="sheet" role="dialog" aria-labelledby="opt-title" onClick={() => setSheet(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <h2 id="opt-title" style={{ fontSize: '1.25rem' }}>{item.name}</h2>
            <div className="stock-card">
              <strong>Quantidade comprada</strong>
              <span className="stepper">
                <button className="step" aria-label="Menos" onClick={() => update(setQty(trip, item.key, item.qty - 1))}>−</button>
                <span className="num stepper-value" style={{ minWidth: '5.5rem' }}>{item.qty} {item.unitWord}</span>
                <button className="step" aria-label="Mais" onClick={() => update(setQty(trip, item.key, item.qty + 1))}>+</button>
              </span>
            </div>
            {item.unplanned ? (
              <button className="pick" onClick={() => { update(removeUnplanned(trip, item.key)); setSheet(null) }}>Tirar das compras</button>
            ) : (
              <>
                <button className="pick" onClick={() => setSheet({ kind: 'substitute', key: item.key })}>Não há · levei outro produto</button>
                {isSubstituted(item) && <button className="pick" onClick={() => { update(revertSubstitute(trip, item.key)); setSheet(null) }}>Voltar ao produto planeado</button>}
                {item.status !== 'skipped' && <button className="pick" onClick={() => { update(skip(trip, item.key)); setSheet(null) }}>Não comprei</button>}
              </>
            )}
            <button className="btn btn-primary" onClick={() => setSheet(null)}>OK</button>
          </div>
        </div>
      )}
      {sheet?.kind === 'substitute' && item && (
        <ProductPicker title="O que levou em vez?" subtitle={`Não há ${item.plannedName}`} products={products} exclude={item.plannedId ? [item.plannedId] : []}
          note={<>A substituição é decisão sua. Fica registada «em vez de {item.plannedName}»; o produto planeado mantém a sua marca em Stock.</>}
          onPick={(p) => { update(substitute(trip, item.key, p)); setSheet(null) }} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'unplanned' && (
        <ProductPicker title="Item não planeado" products={products} onPick={(pick) => setSheet({ kind: 'unplanned-qty', pick, qty: 1 })} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'unplanned-qty' && (
        <div className="sheet" role="dialog" aria-labelledby="un-title" onClick={() => setSheet(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <h2 id="un-title" style={{ fontSize: '1.25rem' }}>Item não planeado</h2>
            <div className="stock-card"><span className="muted">Produto</span><strong>{sheet.pick.name}</strong></div>
            <div className="stock-card">
              <strong>Quantidade</strong>
              <span className="stepper">
                <button className="step" aria-label="Menos" onClick={() => setSheet({ ...sheet, qty: Math.max(1, sheet.qty - 1) })}>−</button>
                <span className="num stepper-value" style={{ minWidth: '5.5rem' }}>{sheet.qty} {sheet.pick.unitWord}</span>
                <button className="step" aria-label="Mais" onClick={() => setSheet({ ...sheet, qty: Math.min(9999, sheet.qty + 1) })}>+</button>
              </span>
            </div>
            <button className="btn btn-primary" onClick={() => { update(addUnplanned(trip, sheet.pick, sheet.qty)); setSheet(null) }}>Adicionar às compras</button>
          </div>
        </div>
      )}
    </main>
  )
}

export function HandoffPage() {
  const org = useOrganization()
  const navigate = useNavigate()
  const trip = loadTrip(org.id)
  if (!trip || boughtItems(trip).length === 0) {
    return (
      <main className="app-main">
        <p className="muted">Não há compras marcadas no mercado.</p>
        <button className="btn btn-secondary" onClick={() => navigate('/stock')}>Voltar a Stock</button>
      </main>
    )
  }
  const bought = boughtItems(trip)
  const notBought = trip.items.filter((i) => i.status !== 'bought' && !i.unplanned)
  const meta = (i: TripItem) => (isSubstituted(i) ? `em vez de ${i.plannedName}` : i.unplanned ? 'não planeado' : i.urgent ? 'planeado · urgente' : 'planeado')
  return (
    <main className="app-main">
      <header className="flow-header-row">
        <button className="icon-btn" aria-label="Voltar" onClick={() => navigate('/stock/mercado')}>←</button>
        <span className="muted" style={{ fontWeight: 600 }}>Compras</span><span style={{ width: '2.75rem' }} />
      </header>
      <section className="stack">
        <h1 style={{ fontSize: '1.625rem' }}>Registar a compra real</h1>
        <p className="muted" style={{ margin: 0 }}>A lista era um plano. A seguir regista o que comprou de facto — quantidades e custos reais. Nada entra em Dinheiro nem em Stock até confirmar.</p>
      </section>
      <section className="stack" style={{ gap: 0 }}>
        <span className="label">Vai para a compra</span>
        {bought.map((i) => (
          <div key={i.key} className="list-row">
            <span className="grow"><strong style={{ display: 'block' }}>{i.name}</strong><span className="muted" style={{ fontSize: '0.875rem' }}>{meta(i)}</span></span>
            <strong className="num">{i.qty} {i.unitWord}</strong>
          </div>
        ))}
      </section>
      {notBought.length > 0 && (
        <section className="stack" style={{ gap: 0 }}>
          <span className="label">Não comprado · fica marcado em Stock</span>
          {notBought.map((i) => (
            <div key={i.key} className="list-row">
              <span className="grow muted">{i.plannedName ?? i.name}</span>
              <span className="muted num" style={{ fontSize: '0.875rem' }}>{i.status === 'skipped' ? 'não comprei · ' : ''}planeado {i.plannedQty ?? i.qty} {i.plannedUnit ?? i.unitWord}</span>
            </div>
          ))}
        </section>
      )}
      {bought.some((i) => i.urgent) && <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>Se o item urgente foi comprado noutro sítio ou noutro dia, registe-o como compra à parte.</p>}
      <div className="footer">
        <button className="btn btn-primary btn-tall" onClick={() => navigate('/dinheiro/compra', { state: { fromTrip: true } })}>Continuar para Registar compra</button>
      </div>
    </main>
  )
}
