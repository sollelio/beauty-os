// Stock (Slice 05 K1/K1b): attention first — Urgente · comprar já → Atenção (Comprar before Baixo) → Em ordem.
// The state is what a person marked; purchases only add facts beside it ("comprado hoje · …").
// On the mobile shell: rows of the shared pattern, the one primary action in the bottom bar, the product and history
// sheets as history entries (back closes them; unsaved product edits are never dropped without "Descartar?").
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import {
  getProductHistory, getStockOverview, LEVEL_LABEL, productNote, STATE_LABEL, STOCK_FOOTNOTE, stockKeys, updateStock,
  type StockEdit, type StockLevel, type StockProduct, type StockState,
} from '../../modules/stock/api'
import { formatMoney } from '../../shared/money'
import { formatDayShort } from '../../shared/time'
import { AppBar, AppScreen, BottomActionBar } from '../../shared/ui/AppShell'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack, useFlow, useSheet } from '../../shared/ui/navigation'
import { SegmentedControl } from '../../shared/ui/SegmentedControl'
import { StatusChip } from '../../shared/ui/StatusChip'
import { EmptyState, ErrorState, Skeleton } from '../../shared/ui/states'

const ORDER: Record<StockState, number> = { comprar: 0, baixo: 1, ok: 2 }
const STATE_TONE = { ok: 'success', baixo: 'caution', comprar: 'warning' } as const
const STATES = (['ok', 'baixo', 'comprar'] as StockState[]).map((s) => ({ id: s, label: STATE_LABEL[s] }))

type Draft = { state: StockState; level: StockLevel | null; reserve_units: number; on_list: boolean; urgent: boolean }
type Sheet = { kind: 'product' | 'history'; id: string; d: Draft }
const draftOf = (p: StockProduct): Draft => ({ state: p.state, level: p.level, reserve_units: p.reserve_units, on_list: p.on_list, urgent: p.urgent })
const changes = (d: Draft, p: StockProduct): StockEdit => {
  const edit: StockEdit = {}
  for (const k of Object.keys(d) as (keyof Draft)[]) if (d[k] !== p[k]) Object.assign(edit, { [k]: d[k] })
  return edit
}

export function StockPage() {
  const navigate = useNavigate()
  const back = useAppBack('/')
  const overview = useQuery({ queryKey: stockKeys.overview, queryFn: getStockOverview })
  const [showOk, setShowOk] = useState<boolean | null>(null)
  const sheets = useSheet<Sheet>()
  const sheet = sheets.current

  const all = overview.data ?? []
  const urgent = all.filter((p) => p.urgent)
  const attention = all.filter((p) => !p.urgent && p.state !== 'ok').sort((a, b) => ORDER[a.state] - ORDER[b.state])
  const ok = all.filter((p) => !p.urgent && p.state === 'ok')
  const onList = all.filter((p) => p.on_list).length
  const calm = urgent.length === 0 && attention.length === 0
  const okOpen = showOk ?? calm
  const open = sheet ? all.find((p) => p.id === sheet.id) ?? null : null
  // unsaved product edits: back, the backdrop and × ask first (the same guard as a capture flow's sheet)
  const sheetDirty = Boolean(sheet && open && Object.keys(changes(sheet.d, open)).length > 0)
  const flow = useFlow({ steps: 1, parent: '/', dirty: false, sheetDirty, reachable: () => true })
  const [askClose, setAskClose] = useState(false)

  const row = (p: StockProduct, dot = false) => (
    <ListRow key={p.id} as="button" onClick={() => sheets.open({ kind: 'product', id: p.id, d: draftOf(p) })}
      leading={dot ? <span aria-hidden className="urgent-dot" /> : undefined} title={p.name} subtitle={productNote(p)}
      trailing={<>
        {p.on_list && !p.urgent && <span role="img" aria-label="Na lista de compra" className="row-chevron"><Icon name="list" /></span>}
        <StatusChip tone={STATE_TONE[p.state]}>{STATE_LABEL[p.state]}</StatusChip>
      </>} />
  )
  const closeSheet = () => (sheetDirty ? setAskClose(true) : sheets.close())

  return (
    <AppScreen
      bar={<AppBar title="Stock" leading="back" onLeading={back} />}
      actions={
        <BottomActionBar>
          <button className="btn btn-primary btn-tall" onClick={() => navigate('/stock/lista')}>
            {onList > 0 ? `Preparar compra · ${onList} ${onList === 1 ? 'produto' : 'produtos'}` : 'Preparar compra'}
          </button>
        </BottomActionBar>
      }>
      <span className="label">Estado aproximado · marcado pela equipa</span>
      {overview.isPending && <Skeleton rows={4} />}
      {overview.isError && <ErrorState onRetry={() => overview.refetch()}>Não foi possível carregar o Stock.</ErrorState>}
      {overview.data && all.length === 0 && (
        <EmptyState icon="box" title="Ainda sem produtos">Os produtos aparecem aqui depois da primeira compra registada, ou quando juntar um à lista de compra.</EmptyState>
      )}
      {overview.data && all.length > 0 && (
        <>
          {urgent.length > 0 && (
            <section className="stack"><span className="label">Urgente · comprar já</span><ListGroup>{urgent.map((p) => row(p, true))}</ListGroup></section>
          )}
          <section className="stack">
            <span className="label">Atenção</span>
            {calm ? <div className="notice notice-success">Nada marcado como baixo ou a comprar.</div> : <ListGroup>{attention.map((p) => row(p))}</ListGroup>}
          </section>
          {ok.length > 0 && (
            <section className="stack">
              <button className="group-toggle" aria-expanded={okOpen} onClick={() => setShowOk(!okOpen)}>
                <span className="label">Em ordem · {ok.length}</span>
                <span className="toggle-chevron" data-open={okOpen}><Icon name="chevronDown" /></span>
              </button>
              {okOpen && <ListGroup>{ok.map((p) => row(p))}</ListGroup>}
            </section>
          )}
        </>
      )}
      <p className="note support">{STOCK_FOOTNOTE}</p>

      {sheet?.kind === 'product' && open && (
        <ProductSheet key={open.id} product={open} d={sheet.d} dirty={sheetDirty} onChange={(d) => sheets.update({ ...sheet, d })}
          onHistory={() => sheets.update({ ...sheet, kind: 'history' })} onClose={closeSheet}
          onSaved={() => { flow.allowNext(); sheets.close() }} />
      )}
      {sheet?.kind === 'history' && open && <HistorySheet product={open} onBack={() => sheets.update({ ...sheet, kind: 'product' })} />}
      <DiscardSheet open={askClose || (flow.discard.open && flow.discard.reason === 'sheet')} title="Descartar as alterações?" detail="O produto fica como estava."
        onKeep={() => (askClose ? setAskClose(false) : flow.discard.cancel())}
        onDiscard={() => { if (askClose) { setAskClose(false); flow.allowNext(); sheets.close() } else flow.discard.confirm() }} />
    </AppScreen>
  )
}

function ProductSheet({ product, d, dirty, onChange, onHistory, onClose, onSaved }: {
  product: StockProduct; d: Draft; dirty: boolean; onChange: (d: Draft) => void; onHistory: () => void; onClose: () => void; onSaved: () => void
}) {
  const org = useOrganization()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const last = product.last_purchase

  function pickState(state: StockState) { onChange({ ...d, state, on_list: state === 'comprar' ? true : d.on_list }) }   // Comprar also lists it
  async function save() {
    const edit = changes(d, product)
    if (Object.keys(edit).length === 0) return onSaved()
    setSaving(true); setFailed(false)
    try {
      await updateStock(product.id, edit)
      await qc.invalidateQueries({ queryKey: ['stock'] })
      onSaved()
    } catch { setFailed(true) } finally { setSaving(false) }
  }

  return (
    <BottomSheet labelledBy="pr-title" onDismiss={onClose} dismissible={!dirty}>
      <div className="row-between">
        <span className="stack stack-tight">
          <h2 id="pr-title" className="sheet-title">{product.name}</h2>
          <span className="support">{[product.purpose, product.unit_word].filter(Boolean).join(' · ')}</span>
        </span>
        <button className="icon-btn" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
      </div>
      <span className="label">Estado</span>
      <SegmentedControl label="Estado do produto" hideLabel options={STATES} value={d.state} onChange={(s) => pickState(s as StockState)} />
      <section className="stack">
        <span className="label">Quanto resta? (aproximado)</span>
        <div className="wrap" role="group" aria-label="Quanto resta">
          {(Object.keys(LEVEL_LABEL) as StockLevel[]).map((l) => (
            <button key={l} type="button" className="chip chip-outline" aria-pressed={d.level === l} onClick={() => onChange({ ...d, level: d.level === l ? null : l })}>{LEVEL_LABEL[l]}</button>
          ))}
        </div>
      </section>
      <ListGroup>
        <div className="row">
          <span className="row-body"><span className="row-title">Em reserva</span><span className="row-subtitle">unidades por abrir</span></span>
          <span className="stepper">
            <button className="step" aria-label="Menos em reserva" onClick={() => onChange({ ...d, reserve_units: Math.max(0, d.reserve_units - 1) })}><Icon name="minus" /></button>
            <span className="num stepper-value" data-testid="reserve">{d.reserve_units}</span>
            <button className="step" aria-label="Mais em reserva" onClick={() => onChange({ ...d, reserve_units: Math.min(999, d.reserve_units + 1) })}><Icon name="plus" /></button>
          </span>
        </div>
        <ListRow as="button" title="Na lista de compra" current={d.on_list}
          onClick={() => onChange({ ...d, on_list: !d.on_list, urgent: d.on_list ? false : d.urgent })}
          trailing={<span className="row-accent">{d.on_list ? 'Sim · tirar' : 'Juntar'}</span>} />
        <ListRow as="button" title="Urgente · comprar já" current={d.urgent}
          onClick={() => onChange({ ...d, urgent: !d.urgent, on_list: d.urgent ? d.on_list : true })}
          trailing={<span className="row-accent">{d.urgent ? 'Sim · tirar' : 'Marcar'}</span>} />
        {last && (
          <ListRow as="button" onClick={onHistory} title="Última compra" chevron
            subtitle={<span className="num">{[formatDayShort(last.occurred_at, org.timezone), `${last.quantity} ${last.unit_word}`, formatMoney(last.line_cost_minor, org), last.origin].filter(Boolean).join(' · ')}</span>}
            trailing={<span className="row-accent">Ver</span>} />
        )}
      </ListGroup>
      {product.bought_today && <span className="support">Comprado hoje · {product.bought_today.quantity} {product.bought_today.unit_word}. O estado acima é o que estava marcado; mude-o se quiser.</span>}
      {failed && <ErrorState onRetry={save}>Não foi possível guardar. As alterações continuam aqui.</ErrorState>}
      <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'A guardar…' : 'Guardar'}</button>
    </BottomSheet>
  )
}

function HistorySheet({ product, onBack }: { product: StockProduct; onBack: () => void }) {
  const org = useOrganization()
  const h = useQuery({ queryKey: stockKeys.history(product.id), queryFn: () => getProductHistory(product.id) })
  const mark = h.data?.mark
  return (
    <BottomSheet labelledBy="hi-title" onDismiss={onBack}>
      <div className="sheet-head">
        <button className="icon-btn" aria-label="Voltar" onClick={onBack}><Icon name="back" /></button>
        <h2 id="hi-title" className="sheet-title">Compras · {product.name}</h2>
      </div>
      {h.isPending && <Skeleton rows={2} />}
      {h.isError && <ErrorState onRetry={() => h.refetch()}>Não foi possível carregar as compras deste produto.</ErrorState>}
      {h.isSuccess && h.data.purchases.length === 0 && !mark && <EmptyState icon="receipt" title="Sem compras registadas" />}
      {h.isSuccess && (h.data.purchases.length > 0 || mark) && (
        <ListGroup>
          {h.data.purchases.map((x, i) => (
            <ListRow key={i} leading={<span className="row-time num">{formatDayShort(x.occurred_at, org.timezone)}</span>}
              title={<span className="num">{[`${x.quantity} ${x.unit_word}`, x.origin].filter(Boolean).join(' · ')}</span>}
              trailing={<span className="row-value num">{formatMoney(x.line_cost_minor, org)}</span>} />
          ))}
          {mark && (
            <ListRow title={`Marcado «${STATE_LABEL[mark.state].toLocaleLowerCase('pt-PT')}»`}
              subtitle={<span className="num">{formatDayShort(mark.marked_at, org.timezone)}{mark.days_after_purchase !== null ? ` · ${mark.days_after_purchase} dias depois da compra` : ''}</span>} />
          )}
        </ListGroup>
      )}
      <p className="note support">Das compras registadas (Dinheiro). Mostra o produto, a quantidade, o custo da linha e onde foi comprado. Quem pagou não aparece aqui.</p>
    </BottomSheet>
  )
}
