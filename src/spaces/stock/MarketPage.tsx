// Modo mercado (Slice 05 K4/K5) and Passagem (K6). The trip is a local draft rebuilt from the current list on each
// entry, keeping progress; checking items records nothing. The real purchase is the Slice 03 flow.
// On the mobile shell, for one hand in a busy market: the whole row toggles «comprado» (72px; the round check is a mark,
// not the target; the quantity sits under the name so a long name keeps the row's width); ⋯ is its own 48px button; every sheet is a history entry (back closes it); the draft is saved on
// every change, so moving back to the list and in again keeps it.
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { getStockOverview, stockKeys, type StockProduct } from '../../modules/stock/api'
import { ProductPicker } from '../../modules/stock/ProductPicker'
import {
  addUnplanned, boughtItems, buildTrip, clearTrip, isSubstituted, loadTrip, removeUnplanned, revertSubstitute, saveTrip,
  setQty, skip, substitute, toggle, tripCounts, type PickedProduct, type Trip, type TripItem,
} from '../../modules/stock/trip'
import { AppBar, AppScreen, BottomActionBar } from '../../shared/ui/AppShell'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack, useSheet } from '../../shared/ui/navigation'
import { EmptyState, ErrorState, Skeleton } from '../../shared/ui/states'

type Sheet = { kind: 'options'; key: string } | { kind: 'substitute'; key: string } | { kind: 'unplanned' } | { kind: 'unplanned-qty'; pick: PickedProduct; qty: number }

export function MarketPage() {
  const navigate = useNavigate()
  const back = useAppBack('/stock/lista')
  const overview = useQuery({ queryKey: stockKeys.overview, queryFn: getStockOverview })
  if (overview.data) return <MarketTrip products={overview.data} back={back} />
  return (
    <AppScreen bar={<AppBar title="Compras" leading="back" onLeading={back} />}>
      {overview.isError
        ? <ErrorState onRetry={() => overview.refetch()} action={<button type="button" className="link-btn" onClick={() => navigate('/stock/lista')}>Voltar à lista</button>}>
            Não foi possível carregar a lista de compra.
          </ErrorState>
        : <Skeleton rows={4} />}
    </AppScreen>
  )
}

function MarketTrip({ products, back }: { products: StockProduct[]; back: () => void }) {
  const org = useOrganization()
  const navigate = useNavigate()
  // Rebuilt from the current list on entry, keeping progress from the stored draft.
  const [trip, setTrip] = useState<Trip>(() => { const t = buildTrip(products, loadTrip(org.id)); saveTrip(org.id, t); return t })
  const sheets = useSheet<Sheet>()
  const sheet = sheets.current
  const ending = useSheet<true>()                                       // "Terminar sem compra?" — back keeps the trip
  const update = (t: Trip) => { saveTrip(org.id, t); setTrip(t) }
  const c = tripCounts(trip)
  const item = sheet && 'key' in sheet ? trip.items.find((i) => i.key === sheet.key) : undefined
  const groups = [
    { label: 'Urgente · comprar já', items: trip.items.filter((i) => i.urgent) },
    { label: 'Compra do mês', items: trip.items.filter((i) => !i.urgent) },
  ].filter((g) => g.items.length > 0)
  const sub = (i: TripItem) => (isSubstituted(i) ? `em vez de ${i.plannedName}` : i.unplanned ? 'não planeado' : i.status === 'skipped' ? 'não comprei' : null)

  return (
    <AppScreen
      bar={<AppBar title="Compras" leading="back" onLeading={back} trailing={<span className="app-bar-step num" data-testid="progress">{c.progress}</span>} />}
      actions={
        <BottomActionBar>
          <span className="bar-summary" data-testid="trip-summary">
            {c.bought} {c.bought === 1 ? 'comprado' : 'comprados'} · {c.pending} por comprar · {c.skipped} não comprei
          </span>
          {c.bought > 0
            ? <button className="btn btn-primary btn-tall" onClick={() => navigate('/stock/passagem')}>Terminar e registar compra</button>
            : <button className="btn btn-destructive" onClick={() => ending.open(true)}>Terminar sem compra</button>}
        </BottomActionBar>
      }>
      {trip.items.length === 0 && <EmptyState icon="list" title="Lista vazia">Junte produtos à lista de compra antes de ir ao mercado.</EmptyState>}
      {trip.items.length > 0 && c.bought === 0 && <p className="note">Marque o que vai comprando.</p>}
      {groups.map((g) => (
        <section key={g.label} className="stack">
          <span className="label">{g.label}</span>
          <ListGroup>
            {g.items.map((i) => (
              <div key={i.key} className="row-line">
                <button type="button" className={`row row-tappable row-market${i.status === 'skipped' ? ' is-skipped' : ''}`} aria-pressed={i.status === 'bought'}
                  onClick={() => update(toggle(trip, i.key))}>
                  <span className="row-leading"><span className="check-mark" aria-hidden>{i.status === 'bought' && <Icon name="check" size={18} strokeWidth={3} />}</span></span>
                  <span className="row-body">
                    <span className="row-title">{i.name}</span>
                    <span className="row-qty">{i.qty} {i.unitWord}</span>
                    {sub(i) && <span className="row-subtitle">{sub(i)}</span>}
                  </span>
                </button>
                <button className="icon-btn" aria-label={`Opções: ${i.name}`} onClick={() => sheets.open({ kind: 'options', key: i.key })}><Icon name="more" /></button>
              </div>
            ))}
          </ListGroup>
        </section>
      ))}
      <button className="btn btn-secondary btn-dashed" onClick={() => sheets.open({ kind: 'unplanned' })}><Icon name="plus" />Item não planeado</button>

      {ending.current && (
        <ConfirmDialog title="Terminar sem compra?" safeLabel="Continuar no mercado" destructiveLabel="Terminar sem compra"
          onSafe={ending.close} onDestructive={() => { clearTrip(org.id); ending.leaveTo('/stock') }}>
          O que marcou nesta ida ao mercado perde-se. A lista de compras fica como está.
        </ConfirmDialog>
      )}

      {sheet?.kind === 'options' && item && (
        <BottomSheet labelledBy="opt-title" onDismiss={sheets.close}>
          <div className="row-between">
            <h2 id="opt-title" className="sheet-title">{item.name}</h2>
            <button className="icon-btn" aria-label="Fechar" onClick={sheets.close}><Icon name="close" /></button>
          </div>
          <div className="row-between">
            <span className="row-title">Quantidade comprada</span>
            <span className="stepper">
              <button className="step" aria-label="Menos" onClick={() => update(setQty(trip, item.key, item.qty - 1))}><Icon name="minus" /></button>
              <span className="num stepper-value">{item.qty} {item.unitWord}</span>
              <button className="step" aria-label="Mais" onClick={() => update(setQty(trip, item.key, item.qty + 1))}><Icon name="plus" /></button>
            </span>
          </div>
          <ListGroup>
            {item.unplanned ? (
              <ListRow as="button" title="Tirar das compras" onClick={() => { update(removeUnplanned(trip, item.key)); sheets.close() }} />
            ) : (
              <>
                <ListRow as="button" title="Não há · levei outro produto" chevron onClick={() => sheets.update({ kind: 'substitute', key: item.key })} />
                {isSubstituted(item) && <ListRow as="button" title="Voltar ao produto planeado" onClick={() => { update(revertSubstitute(trip, item.key)); sheets.close() }} />}
                {item.status !== 'skipped' && <ListRow as="button" title="Não comprei" onClick={() => { update(skip(trip, item.key)); sheets.close() }} />}
              </>
            )}
          </ListGroup>
          <button className="btn btn-primary" onClick={sheets.close}>OK</button>
        </BottomSheet>
      )}
      {sheet?.kind === 'substitute' && item && (
        <ProductPicker title="O que levou em vez?" subtitle={`Não há ${item.plannedName}`} products={products} exclude={item.plannedId ? [item.plannedId] : []}
          note={<>A substituição é decisão sua. Fica registada «em vez de {item.plannedName}»; o produto planeado mantém a sua marca em Stock.</>}
          onPick={(p) => { update(substitute(trip, item.key, p)); sheets.close() }} onClose={sheets.close} />
      )}
      {sheet?.kind === 'unplanned' && (
        <ProductPicker title="Item não planeado" products={products} onPick={(pick) => sheets.update({ kind: 'unplanned-qty', pick, qty: 1 })} onClose={sheets.close} />
      )}
      {sheet?.kind === 'unplanned-qty' && (
        <BottomSheet labelledBy="un-title" onDismiss={sheets.close}>
          <div className="row-between">
            <h2 id="un-title" className="sheet-title">Item não planeado</h2>
            <button className="icon-btn" aria-label="Fechar" onClick={sheets.close}><Icon name="close" /></button>
          </div>
          <ListGroup>
            <ListRow title={sheet.pick.name} subtitle="Produto" />
          </ListGroup>
          <div className="row-between">
            <span className="row-title">Quantidade</span>
            <span className="stepper">
              <button className="step" aria-label="Menos" onClick={() => sheets.update({ ...sheet, qty: Math.max(1, sheet.qty - 1) })}><Icon name="minus" /></button>
              <span className="num stepper-value">{sheet.qty} {sheet.pick.unitWord}</span>
              <button className="step" aria-label="Mais" onClick={() => sheets.update({ ...sheet, qty: Math.min(9999, sheet.qty + 1) })}><Icon name="plus" /></button>
            </span>
          </div>
          <button className="btn btn-primary" onClick={() => { update(addUnplanned(trip, sheet.pick, sheet.qty)); sheets.close() }}>Adicionar às compras</button>
        </BottomSheet>
      )}
    </AppScreen>
  )
}

// Passagem (K6): plan vs real before the Slice 03 purchase. With nothing bought (e.g. back here after the purchase was
// recorded and the draft cleared) there is nothing to hand over: Stock replaces this entry, so no dead end stays behind.
export function HandoffPage() {
  const org = useOrganization()
  const navigate = useNavigate()
  const back = useAppBack('/stock/mercado')
  const trip = loadTrip(org.id)
  if (!trip || boughtItems(trip).length === 0) return <Navigate to="/stock" replace />
  const bought = boughtItems(trip)
  const notBought = trip.items.filter((i) => i.status !== 'bought' && !i.unplanned)
  const meta = (i: TripItem) => (isSubstituted(i) ? `em vez de ${i.plannedName}` : i.unplanned ? 'não planeado' : i.urgent ? 'planeado · urgente' : 'planeado')
  return (
    <AppScreen
      bar={<AppBar title="Compras" leading="back" onLeading={back} />}
      actions={
        <BottomActionBar>
          <span className="bar-summary">{bought.length} {bought.length === 1 ? 'produto vai' : 'produtos vão'} para a compra · os custos introduz a seguir</span>
          <button className="btn btn-primary btn-tall" onClick={() => navigate('/dinheiro/compra', { state: { fromTrip: true } })}>Continuar para Registar compra</button>
        </BottomActionBar>
      }>
      <section className="stack">
        <h2>Registar a compra real</h2>
        <p className="note">A lista era um plano. A seguir regista o que comprou de facto — quantidades e custos reais. Nada entra em Dinheiro nem em Stock até confirmar.</p>
      </section>
      <section className="stack">
        <span className="label">Vai para a compra</span>
        <ListGroup>
          {bought.map((i) => (
            <ListRow key={i.key} title={i.name} subtitle={meta(i)} trailing={<span className="row-value num">{i.qty} {i.unitWord}</span>} />
          ))}
        </ListGroup>
      </section>
      {notBought.length > 0 && (
        <section className="stack">
          <span className="label">Não comprado · fica marcado em Stock</span>
          <ListGroup>
            {notBought.map((i) => (
              <ListRow key={i.key} className="row-muted" title={i.plannedName ?? i.name}
                trailing={<span className="support num">{i.status === 'skipped' ? 'não comprei · ' : ''}planeado {i.plannedQty ?? i.qty} {i.plannedUnit ?? i.unitWord}</span>} />
            ))}
          </ListGroup>
        </section>
      )}
      {bought.some((i) => i.urgent) && <p className="note support">Se o item urgente foi comprado noutro sítio ou noutro dia, registe-o como compra à parte.</p>}
    </AppScreen>
  )
}
