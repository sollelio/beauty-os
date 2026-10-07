// Stock (Slice 05 K1/K1b): attention first — Urgente · comprar já → Atenção (Comprar before Baixo) → Em ordem.
// The state is what a person marked; purchases only add facts beside it ("comprado hoje · …").
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

const ORDER: Record<StockState, number> = { comprar: 0, baixo: 1, ok: 2 }

function StatePill({ state }: { state: StockState }) {
  return <span className={`state-pill st-${state}`}>{STATE_LABEL[state]}</span>
}

export function StockPage() {
  const navigate = useNavigate()
  const overview = useQuery({ queryKey: stockKeys.overview, queryFn: getStockOverview })
  const [openId, setOpenId] = useState<string | null>(null)
  const [showOk, setShowOk] = useState<boolean | null>(null)

  const all = overview.data ?? []
  const urgent = all.filter((p) => p.urgent)
  const attention = all.filter((p) => !p.urgent && p.state !== 'ok').sort((a, b) => ORDER[a.state] - ORDER[b.state])
  const ok = all.filter((p) => !p.urgent && p.state === 'ok')
  const onList = all.filter((p) => p.on_list).length
  const calm = urgent.length === 0 && attention.length === 0
  const okOpen = showOk ?? calm
  const open = all.find((p) => p.id === openId) ?? null

  const row = (p: StockProduct, dot = false) => (
    <button key={p.id} className="stock-row" onClick={() => setOpenId(p.id)}>
      {dot && <span aria-hidden className="urgent-dot" />}
      <span className="grow"><strong style={{ display: 'block' }}>{p.name}</strong><span className="muted" style={{ fontSize: '0.875rem' }}>{productNote(p)}</span></span>
      {p.on_list && !p.urgent && <span role="img" aria-label="Na lista de compra" className="list-icon">☰</span>}
      <StatePill state={p.state} />
    </button>
  )

  return (
    <main className="app-main">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div className="stack" style={{ gap: '0.25rem' }}><span className="label">Estado aproximado · marcado pela equipa</span><h1>Stock</h1></div>
        <button className="icon-btn" aria-label="Voltar a Hoje" onClick={() => navigate('/')}>⌂</button>
      </header>
      <button className="btn btn-primary btn-tall" onClick={() => navigate('/stock/lista')}>
        {onList > 0 ? `Preparar compra · ${onList} ${onList === 1 ? 'produto' : 'produtos'}` : 'Preparar compra'}
      </button>
      {overview.isError && <div className="notice notice-error" role="alert">Não foi possível carregar o Stock. <button className="link-btn" onClick={() => overview.refetch()}>Tentar novamente</button></div>}
      {overview.data && (
        <>
          {urgent.length > 0 && (
            <section className="stack" style={{ gap: 0 }}><span className="label">Urgente · comprar já</span>{urgent.map((p) => row(p, true))}</section>
          )}
          <section className="stack" style={{ gap: 0 }}>
            <span className="label">Atenção</span>
            {calm
              ? <div className="notice notice-success" style={{ marginTop: '0.375rem' }}>Nada marcado como baixo ou a comprar.</div>
              : attention.map((p) => row(p))}
          </section>
          {ok.length > 0 && (
            <section className="stack" style={{ gap: 0 }}>
              <button className="group-toggle" aria-expanded={okOpen} onClick={() => setShowOk(!okOpen)}>
                <span className="label">Em ordem · {ok.length}</span><span aria-hidden>{okOpen ? '▴' : '▾'}</span>
              </button>
              {okOpen && ok.map((p) => row(p))}
            </section>
          )}
        </>
      )}
      <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>{STOCK_FOOTNOTE}</p>
      {open && <ProductSheet key={open.id} product={open} onClose={() => setOpenId(null)} />}
    </main>
  )
}

function ProductSheet({ product, onClose }: { product: StockProduct; onClose: () => void }) {
  const org = useOrganization()
  const qc = useQueryClient()
  const [d, setD] = useState({ state: product.state, level: product.level, reserve_units: product.reserve_units, on_list: product.on_list, urgent: product.urgent })
  const [history, setHistory] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const last = product.last_purchase

  function pickState(state: StockState) { setD({ ...d, state, on_list: state === 'comprar' ? true : d.on_list }) }   // Comprar also lists it
  async function save() {
    const edit: StockEdit = {}
    for (const k of Object.keys(d) as (keyof typeof d)[]) if (d[k] !== product[k]) Object.assign(edit, { [k]: d[k] })
    if (Object.keys(edit).length === 0) return onClose()
    setSaving(true); setFailed(false)
    try {
      await updateStock(product.id, edit)
      await qc.invalidateQueries({ queryKey: ['stock'] })
      onClose()
    } catch { setFailed(true) } finally { setSaving(false) }
  }

  if (history) return <HistorySheet product={product} onClose={() => setHistory(false)} />
  return (
    <div className="sheet" role="dialog" aria-labelledby="pr-title" onClick={onClose}>
      <div className="sheet-body" style={{ maxHeight: '92dvh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="flow-header-row">
          <span><h2 id="pr-title" style={{ fontSize: '1.25rem' }}>{product.name}</h2><span className="muted" style={{ fontSize: '0.875rem' }}>{[product.purpose, product.unit_word].filter(Boolean).join(' · ')}</span></span>
          <button className="icon-btn" aria-label="Fechar" onClick={onClose}>×</button>
        </div>
        <section className="stack">
          <span className="label">Estado</span>
          <div className="segmented" role="group" aria-label="Estado do produto">
            {(['ok', 'baixo', 'comprar'] as StockState[]).map((s) => <button key={s} className="seg" aria-pressed={d.state === s} onClick={() => pickState(s)}>{STATE_LABEL[s]}</button>)}
          </div>
        </section>
        <section className="stack">
          <span className="label">Quanto resta? (aproximado)</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {(Object.keys(LEVEL_LABEL) as StockLevel[]).map((l) => (
              <button key={l} className="chip chip-outline" aria-pressed={d.level === l} onClick={() => setD({ ...d, level: d.level === l ? null : l })}>{LEVEL_LABEL[l]}</button>
            ))}
          </div>
        </section>
        <div className="stock-card">
          <span><strong style={{ display: 'block' }}>Em reserva</strong><span className="muted" style={{ fontSize: '0.8125rem' }}>unidades por abrir</span></span>
          <span className="stepper">
            <button className="step" aria-label="Menos em reserva" onClick={() => setD({ ...d, reserve_units: Math.max(0, d.reserve_units - 1) })}>−</button>
            <span className="num stepper-value" data-testid="reserve">{d.reserve_units}</span>
            <button className="step" aria-label="Mais em reserva" onClick={() => setD({ ...d, reserve_units: Math.min(999, d.reserve_units + 1) })}>+</button>
          </span>
        </div>
        {product.bought_today && <span className="muted" style={{ fontSize: '0.875rem' }}>Comprado hoje · {product.bought_today.quantity} {product.bought_today.unit_word}. O estado acima é o que estava marcado; mude-o se quiser.</span>}
        <button className="pick" aria-pressed={d.on_list} onClick={() => setD({ ...d, on_list: !d.on_list, urgent: d.on_list ? false : d.urgent })}>
          <strong>Na lista de compra</strong><span style={{ color: 'var(--accent)', fontWeight: 600 }}>{d.on_list ? 'Sim · tirar' : 'Juntar'}</span>
        </button>
        <button className="pick" aria-pressed={d.urgent} onClick={() => setD({ ...d, urgent: !d.urgent, on_list: d.urgent ? d.on_list : true })}>
          <strong>Urgente · comprar já</strong><span style={{ color: 'var(--accent)', fontWeight: 600 }}>{d.urgent ? 'Sim · tirar' : 'Marcar'}</span>
        </button>
        {last && (
          <button className="pick" onClick={() => setHistory(true)}>
            <span><strong style={{ display: 'block' }}>Última compra</strong>
              <span className="muted num" style={{ fontSize: '0.875rem' }}>{[formatDayShort(last.occurred_at, org.timezone), `${last.quantity} ${last.unit_word}`, formatMoney(last.line_cost_minor, org), last.origin].filter(Boolean).join(' · ')}</span></span>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Ver</span>
          </button>
        )}
        {failed && <div className="notice notice-error" role="alert">Não foi possível guardar. Tente novamente.</div>}
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'A guardar…' : 'Guardar'}</button>
      </div>
    </div>
  )
}

function HistorySheet({ product, onClose }: { product: StockProduct; onClose: () => void }) {
  const org = useOrganization()
  const h = useQuery({ queryKey: stockKeys.history(product.id), queryFn: () => getProductHistory(product.id) })
  const mark = h.data?.mark
  return (
    <div className="sheet" role="dialog" aria-labelledby="hi-title" onClick={onClose}>
      <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
        <div className="flow-header-row"><h2 id="hi-title" style={{ fontSize: '1.25rem' }}>Compras · {product.name}</h2><button className="icon-btn" aria-label="Fechar" onClick={onClose}>×</button></div>
        <div className="list">
          {h.data?.purchases.map((x, i) => (
            <div key={i} className="list-row">
              <span className="num muted" style={{ width: '3.25rem' }}>{formatDayShort(x.occurred_at, org.timezone)}</span>
              <span className="grow num">{[`${x.quantity} ${x.unit_word}`, x.origin].filter(Boolean).join(' · ')}</span>
              <span className="num" style={{ fontWeight: 600 }}>{formatMoney(x.line_cost_minor, org)}</span>
            </div>
          ))}
        </div>
        {mark && (
          <div className="list-row">
            <strong className="grow">Marcado «{STATE_LABEL[mark.state].toLocaleLowerCase('pt-PT')}»</strong>
            <span className="muted num">{formatDayShort(mark.marked_at, org.timezone)}{mark.days_after_purchase !== null ? ` · ${mark.days_after_purchase} dias depois da compra` : ''}</span>
          </div>
        )}
        <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>Das compras registadas (Dinheiro). Mostra o produto, a quantidade, o custo da linha e onde foi comprado. Quem pagou não aparece aqui.</p>
      </div>
    </div>
  )
}
