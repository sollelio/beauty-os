// Registar compra (Slice 03 §4): O que comprou? → Quem pagou? → Confirmação necessária → Sucesso.
// A purchase never changes stock state (Slice 05); its lines are recorded against products.
// Started from Modo mercado (Slice 05 K6b), P1 is pre-filled from the trip draft with costs empty; the draft is cleared
// and the bought plan entries leave the list only after the purchase is recorded. The human state is never touched.
// Steps and the add/line sheet are history entries; lines — and a half-typed line in its sheet — are never dropped
// without "Descartar?" (the mobile back contract).
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { ConfirmerPicker } from '../../modules/org/ConfirmerPicker'
import { isPinError } from '../../modules/org/verifyMessages'
import { useVerifiedCommand } from '../../modules/org/useVerifiedCommand'
import { listPeople, peopleKeys } from '../../modules/org/api'
import { listProducts, listUnitWords, stockKeys, updateStock } from '../../modules/stock/api'
import { boughtItems, clearTrip, endedPlanIds, isSubstituted, loadTrip, type Trip } from '../../modules/stock/trip'
import type { ReviewLine } from '../stock/ReviewPage'
import {
  listPurchaseOrigins, purchasingKeys, recordPurchase, type RecordPurchaseInput, type RecordPurchaseResult,
} from '../../modules/purchasing/api'
import { contributionState, payersText } from '../../modules/purchasing/contributions'
import { formatMoney, minorToWholeUnits, wholeUnitsToMinor } from '../../shared/money'
import { formatTime } from '../../shared/time'
import { AmountField } from '../../shared/ui/AmountField'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { captureFailure } from '../../shared/periodLock'
import { AppBar, AppScreen, BottomActionBar, LockIcon } from '../../shared/ui/AppShell'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { useFlow, useSheet } from '../../shared/ui/navigation'

type Line = { key: string; productId: string | null; name: string; unitWord: string; quantity: number; costDigits: string; insteadOf?: string | null }

const linesFromTrip = (trip: Trip | null): Line[] => (trip ? boughtItems(trip) : []).map((i) => ({
  key: i.key, productId: i.productId, name: i.name, unitWord: i.unitWord, quantity: i.qty, costDigits: '',
  insteadOf: isSubstituted(i) ? i.plannedName : null,
}))
// `draft` is the line as the sheet opened it; `line` is what is being typed (kept here so back can see it is unsaved).
type Sheet = { stage: 'search' } | { stage: 'line'; draft: Line; line: Line; editing: boolean }
const lineStage = (draft: Line, editing: boolean): Sheet => ({ stage: 'line', draft, line: draft, editing })
const lineChanged = (a: Line, b: Line) => a.costDigits !== b.costDigits || a.quantity !== b.quantity || a.unitWord !== b.unitWord
type PersonRow = { personId: string; name: string; digits: string }

const plural = (n: number) => `${n} ${n === 1 ? 'produto' : 'produtos'}`

export function PurchaseFlow() {
  const org = useOrganization()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const command = useVerifiedCommand<RecordPurchaseInput, RecordPurchaseResult>(recordPurchase)

  const fromTrip = Boolean((useLocation().state as { fromTrip?: boolean } | null)?.fromTrip)
  const [trip, setTrip] = useState<Trip | null>(() => (fromTrip ? loadTrip(org.id) : null))
  const [reviewLines, setReviewLines] = useState<ReviewLine[] | null>(null)
  const [lines, setLines] = useState<Line[]>(() => linesFromTrip(trip))
  const sheets = useSheet<Sheet>()
  const sheet = sheets.current
  const [query, setQuery] = useState('')
  const [lastAdded, setLastAdded] = useState<string | null>(null)
  const [salonDigits, setSalonDigits] = useState<string | null>(null)
  const [rows, setRows] = useState<PersonRow[]>([])
  const [pickingPerson, setPickingPerson] = useState(false)
  const [originId, setOriginId] = useState<string | null>(null)
  const [confirmerId, setConfirmerId] = useState<string | null>(null)
  const [secret, setSecret] = useState('')
  const [askLineBack, setAskLineBack] = useState(false)

  const products = useQuery({ queryKey: stockKeys.products, queryFn: listProducts })
  const unitWords = useQuery({ queryKey: stockKeys.unitWords, queryFn: listUnitWords })
  const people = useQuery({ queryKey: peopleKeys.all, queryFn: listPeople })
  const origins = useQuery({ queryKey: purchasingKeys.origins, queryFn: listPurchaseOrigins })

  const lineCost = (l: Line) => wholeUnitsToMinor(l.costDigits, org) ?? 0
  const totalMinor = lines.reduce((s, l) => s + lineCost(l), 0)
  const contrib = contributionState(
    totalMinor,
    salonDigits === null ? null : (wholeUnitsToMinor(salonDigits, org) ?? 0),
    rows.map((r) => ({ personId: r.personId, name: r.name, amountMinor: wholeUnitsToMinor(r.digits, org) })),
    org,
  )
  const origin = origins.data?.find((o) => o.id === originId) ?? null
  const hasData = lines.length > 0

  const input: RecordPurchaseInput | null = lines.length > 0 && totalMinor > 0 && contrib.valid ? {
    lines: lines.map((l) => l.productId
      ? { product_id: l.productId, quantity: l.quantity, line_cost_minor: lineCost(l) }
      : { new_product: { name: l.name, unit_word: l.unitWord }, quantity: l.quantity, line_cost_minor: lineCost(l) }),
    salonAmountMinor: contrib.salonMinor,
    contributions: rows.map((r) => ({ person_id: r.personId, amount_minor: wholeUnitsToMinor(r.digits, org) ?? 0 })),
    originId,
  } : null

  const linesReady = lines.length > 0 && totalMinor > 0 && !lines.some((l) => l.costDigits === '')
  const lineDirty = sheet?.stage === 'line' && lineChanged(sheet.line, sheet.draft)
  const flow = useFlow({ steps: 3, parent: trip ? '/stock/mercado' : '/', dirty: hasData, sheetDirty: lineDirty,
    reachable: (n) => (n === 2 ? linesReady : input !== null) })
  const step = flow.step

  function saveLine(line: Line, editing: boolean) {
    setLines((ls) => editing ? ls.map((l) => (l.key === line.key ? line : l)) : [...ls, line])
    if (editing) { flow.allowNext(); sheets.close() } else { setLastAdded(line.name); setQuery(''); sheets.update({ stage: 'search' }) }
  }
  // The line sheet's ← : an edited line closes, a new one returns to the search. With a typed draft it asks first.
  function lineBack(editing: boolean) {
    if (editing) { flow.allowNext(); sheets.close() } else sheets.update({ stage: 'search' })
  }
  const lineDiscard = sheet?.stage === 'line' && (askLineBack || (flow.discard.open && flow.discard.reason === 'sheet'))
  function confirm() {
    if (!input || !confirmerId || !secret) return
    command.confirm({ input, confirmerId, secret }, {
      onSuccess: () => {
        setSecret(''); flow.finish()
        if (trip) {
          setReviewLines(lines.map((l) => ({ name: l.name, quantity: l.quantity, unitWord: l.unitWord, insteadOf: l.insteadOf ?? null })))
          clearTrip(org.id)                                                     // only now: the real purchase exists
          const ended = endedPlanIds(trip)
          setTrip(null)
          // The plan for what was bought ends (list membership only — state, level and reserve stay as marked).
          void Promise.allSettled(ended.map((id) => updateStock(id, { on_list: false })))
            .then(() => queryClient.invalidateQueries({ queryKey: ['stock'] }))
        }
        void queryClient.invalidateQueries({ queryKey: ['stock'] })            // catalogue, bought today, purchase history
      },
    })
  }
  function startOver() {
    command.reset()
    setReviewLines(null); setLines([]); setSalonDigits(null); setRows([]); setOriginId(null); setConfirmerId(null); setSecret(''); setLastAdded(null)
    flow.restart()
  }

  if (flow.completed && command.result) {
    const r = command.result
    return (
      <AppScreen actions={
        <BottomActionBar>
          <button className="btn btn-primary btn-tall" onClick={() => { command.reset(); flow.leaveTo('/') }}>Voltar a Hoje</button>
          <button className="btn btn-secondary" onClick={startOver}>Registar outra compra</button>
        </BottomActionBar>
      }>
        <div className="stack center" style={{ marginTop: '3rem', gap: '0.75rem' }}>
          <span aria-hidden className="success-mark">✓</span>
          <h2>Compra registada com sucesso.</h2>
          <p className="muted num" style={{ margin: 0 }}>{plural(r.line_count)} · {formatMoney(r.total_minor, org)} · {payersText(r.salon_amount_minor, r.contributors)}</p>
          <p className="muted num" style={{ margin: 0 }}>Hoje às {formatTime(r.occurred_at, org.timezone)}</p>
          <span className="notice notice-success">Registada no histórico de {plural(r.line_count)}</span>
          <button className="link-btn" onClick={() => navigate(`/registos/anular/purchase/${r.purchase_id}`)}>Corrigir este registo</button>
        </div>
        {reviewLines && (
          <section className="stock-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.625rem' }}>
            <span className="label">Stock</span>
            <span className="muted" style={{ fontSize: '0.9rem' }}>As compras ficaram no histórico de cada produto. O estado (OK · Baixo · Comprar) só muda se alguém o mudar — agora ou mais tarde, no Stock.</span>
            <button className="btn btn-secondary" onClick={() => navigate('/stock/rever', { state: { lines: reviewLines } })}>Rever stock · {plural(reviewLines.length)}</button>
            <button className="link-btn" onClick={() => navigate('/stock')}>Voltar a Stock</button>
          </section>
        )}
      </AppScreen>
    )
  }

  const err = command.status === 'error' ? command.error : null
  const q = query.trim()
  const matches = (products.data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
  const exists = (products.data ?? []).some((p) => p.name.toLowerCase() === q.toLowerCase()) || lines.some((l) => l.name.toLowerCase() === q.toLowerCase())

  const footer = step === 1 ? (
    <BottomActionBar>
      <div style={{ display: 'flex', justifyContent: 'space-between' }} className="num">
        <span className="muted">{plural(lines.length)}</span><strong>Total {formatMoney(totalMinor, org)}</strong>
      </div>
      <div style={{ display: 'flex', gap: '0.625rem' }}>
        <button className="btn btn-secondary" style={{ flex: '0 0 auto', width: 'auto' }} onClick={() => { setQuery(''); setLastAdded(null); sheets.open({ stage: 'search' }) }}>+ Produto</button>
        <button className="btn btn-primary btn-tall" disabled={!linesReady} onClick={() => flow.goTo(2)}>Continuar</button>
      </div>
    </BottomActionBar>
  ) : step === 2 ? (
    <BottomActionBar>
      <span className="muted num" style={{ textAlign: 'center' }}>{plural(lines.length)} · {formatMoney(totalMinor, org)}</span>
      <button className="btn btn-primary btn-tall" disabled={!input} onClick={() => flow.goTo(3)}>Continuar</button>
    </BottomActionBar>
  ) : step === 3 && input ? (
    <BottomActionBar>
      {err?.kind === 'network' ? (
        <>
          <button className="btn btn-primary btn-tall" onClick={confirm}>Tentar novamente</button>
          <button className="btn btn-secondary" onClick={flow.exit}>Sair sem guardar</button>
        </>
      ) : (
        <button className="btn btn-primary btn-tall" onClick={confirm} disabled={!confirmerId || !secret || command.status === 'pending'}>
          {command.status === 'pending' ? 'A confirmar…' : 'Confirmar compra'}
        </button>
      )}
    </BottomActionBar>
  ) : undefined

  return (
    <AppScreen
      bar={<AppBar title="Compra" leading={step === 1 ? 'close' : 'back'} onLeading={step === 1 ? flow.exit : () => flow.goTo(step - 1)} step={{ current: step, total: 3 }} />}
      actions={footer}>

      {step === 1 && (
        <>
          <section className="stack">
            <h2>O que comprou?</h2>
            {trip && <div className="lock-note"><span>Pré-preenchido pela lista de compras. Ajuste as quantidades e introduza o que pagou por cada linha.</span></div>}
            {lines.length === 0 && <p className="muted" style={{ margin: 0 }}>Ainda não há produtos nesta compra.</p>}
            <div className="list">
              {lines.map((l) => (
                <div className="list-row" key={l.key}>
                  <button className="grow pick" style={{ border: 0, padding: 0, background: 'transparent' }} onClick={() => sheets.open(lineStage({ ...l }, true))}>
                    <span className="grow" style={{ textAlign: 'left' }}>
                      <strong>{l.name}</strong>
                      <span className="muted num" style={{ display: 'block', fontSize: '0.9rem' }}>{l.quantity} × {l.unitWord}{l.insteadOf ? ` · em vez de ${l.insteadOf}` : ''}</span>
                    </span>
                    {l.costDigits === '' ? <span className="muted" style={{ fontSize: '0.875rem' }}>custo por introduzir</span> : <span className="num" style={{ fontWeight: 600 }}>{formatMoney(lineCost(l), org)}</span>}
                  </button>
                  <button className="icon-btn" aria-label={`Remover ${l.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>🗑</button>
                </div>
              ))}
            </div>
            {trip && <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>Toque numa linha para corrigir quantidade ou custo. Pode remover ou acrescentar produtos — a compra real não tem de ser igual ao plano.</p>}
          </section>
        </>
      )}

      {step === 2 && (
        <>
          <section className="stack" style={{ gap: '1rem' }}>
            <h2>Quem pagou?</h2>
            <span className="num"><span className="muted">Total</span> <strong>{formatMoney(totalMinor, org)}</strong></span>
            <div className="stack">
              <div className="stack" style={{ gap: '0.25rem' }}>
                <span style={{ fontWeight: 600 }}>Salão</span>
                <AmountField label="Salão" value={salonDigits ?? String(minorToWholeUnits(contrib.salonMinor, org))} onChange={setSalonDigits} symbol={org.currency_symbol} />
                <span className="muted" style={{ fontSize: '0.875rem' }}>{contrib.salonMinor === 0 ? 'não contribui' : contrib.salonAutomatic ? 'o resto, automático' : ''}</span>
              </div>
              {rows.map((r) => (
                <div key={r.personId} className="stack" style={{ gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <button className="icon-btn" aria-label={`Remover ${r.name}`} onClick={() => setRows((rs) => rs.filter((x) => x.personId !== r.personId))}>×</button>
                  </div>
                  <AmountField label={`Quanto pagou ${r.name}`} value={r.digits} placeholder="" onChange={(v) => setRows((rs) => rs.map((x) => (x.personId === r.personId ? { ...x, digits: v } : x)))} symbol={org.currency_symbol} />
                </div>
              ))}
              {pickingPerson ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {people.data?.filter((p) => !rows.some((r) => r.personId === p.id)).map((p) => (
                    <button key={p.id} className="chip" onClick={() => { setRows((rs) => [...rs, { personId: p.id, name: p.display_name, digits: '' }]); setPickingPerson(false) }}>{p.display_name}</button>
                  ))}
                  <button className="link-btn" onClick={() => setPickingPerson(false)}>Cancelar</button>
                </div>
              ) : (
                <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setPickingPerson(true)}>+ Outra pessoa contribuiu</button>
              )}
              <span className="muted num" data-testid="contribution-sentence">{contrib.sentence}</span>
            </div>
            <div className="stack">
              <span className="label">Onde comprou (opcional)</span>
              <div className="segmented" role="group" aria-label="Onde comprou">
                {origins.data?.map((o) => (
                  <button key={o.id} className="seg" aria-pressed={originId === o.id} onClick={() => setOriginId(originId === o.id ? null : o.id)}>{o.label}</button>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {step === 3 && input && (
        <>
          <section className="stack" style={{ gap: '1rem' }}>
            <h2>Confirmação necessária</h2>
            <p className="muted" style={{ margin: 0 }}>Esta compra tem de ser confirmada por uma pessoa autorizada.</p>
            <dl className="kv-card">
              <div><dt>Produtos</dt><dd>{plural(lines.length)}</dd></div>
              <div><dt>Total</dt><dd className="num">{formatMoney(totalMinor, org)}</dd></div>
              <div><dt>Quem pagou</dt><dd className="num">
                {[...(contrib.salonMinor > 0 ? [`Salão ${formatMoney(contrib.salonMinor, org)}`] : []), ...rows.map((r) => `${r.name} ${formatMoney(wholeUnitsToMinor(r.digits, org) ?? 0, org)}`)].join(' · ')}
              </dd></div>
              <div><dt>Onde</dt><dd>{origin?.label ?? '—'}</dd></div>
            </dl>
            <div className="lock-note"><LockIcon /><span>Fica no histórico com data, hora e quem confirmou. Entra em Dinheiro e fica no histórico dos produtos em Stock.</span></div>
            <ConfirmerPicker confirmerId={confirmerId} onConfirmer={setConfirmerId} secret={secret} onSecret={setSecret} error={err} />
            {err?.kind === 'network' && <div className="notice notice-error" role="alert">Não foi possível guardar. Os dados continuam aqui.</div>}
            {err && err.kind !== 'network' && !isPinError(err) && <div className="notice notice-error" role="alert">{captureFailure(err, 'Não foi possível guardar esta compra.')}</div>}
          </section>
        </>
      )}

      {sheet?.stage === 'search' && (
        <BottomSheet labelledBy="add-title" onDismiss={sheets.close}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 id="add-title" className="sheet-title">Adicionar produto</h2>
            <button className="icon-btn" aria-label="Fechar" onClick={sheets.close}>×</button>
          </div>
          {lastAdded && (
            <div className="notice notice-success" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{lastAdded} adicionado</span>
              <button className="link-btn" onClick={sheets.close}>Terminar</button>
            </div>
          )}
          <label className="field"><input type="search" data-autofocus aria-label="Procurar ou escrever produto" placeholder="Procurar ou escrever produto" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <div className="stack">
            {matches.map((p) => {
              const inList = lines.find((l) => l.productId === p.id)
              return (
                <button key={p.id} className="pick" onClick={() => inList
                  ? sheets.update(lineStage({ ...inList }, true))
                  : sheets.update(lineStage({ key: crypto.randomUUID(), productId: p.id, name: p.name, unitWord: p.unit_word, quantity: 1, costDigits: '' }, false))}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span className="muted">{inList ? `já na compra · ${inList.quantity} × ${inList.unitWord}` : p.unit_word}</span>
                </button>
              )
            })}
            {q.length >= 2 && !exists && (
              <button className="pick" style={{ borderStyle: 'dashed' }} onClick={() => sheets.update(lineStage({ key: crypto.randomUUID(), productId: null, name: q, unitWord: '', quantity: 1, costDigits: '' }, false))}>
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>Criar produto novo: «{q}»</span>
              </button>
            )}
            {q && matches.length === 0 && <span className="muted">Sem resultados para «{q}».</span>}
          </div>
        </BottomSheet>
      )}

      {sheet?.stage === 'line' && (
        <LineSheet line={sheet.line} editing={sheet.editing} unitWords={unitWords.data ?? []} symbol={org.currency_symbol}
          onChange={(line) => sheets.update({ ...sheet, line })}
          onBack={() => (lineDirty ? setAskLineBack(true) : lineBack(sheet.editing))} onSave={(l) => saveLine(l, sheet.editing)} />
      )}
      {sheet?.stage === 'line' && (
        <DiscardSheet open={lineDiscard} title={sheet.editing ? 'Descartar as alterações?' : 'Descartar este produto?'}
          detail={sheet.editing ? 'A linha fica como estava.' : 'Não é adicionado à compra.'}
          onKeep={() => (askLineBack ? setAskLineBack(false) : flow.discard.cancel())}
          onDiscard={() => { if (askLineBack) { setAskLineBack(false); lineBack(sheet.editing) } else flow.discard.confirm() }} />
      )}

      <DiscardSheet open={flow.discard.open && flow.discard.reason === 'leave'} title="Descartar esta compra?" onDiscard={flow.discard.confirm} onKeep={flow.discard.cancel} />
    </AppScreen>
  )
}

function LineSheet({ line, editing, unitWords, symbol, onChange: setLine, onBack, onSave }: {
  line: Line; editing: boolean; unitWords: string[]; symbol: string; onChange: (l: Line) => void; onBack: () => void; onSave: (l: Line) => void
}) {
  const isNew = line.productId === null
  const ready = line.costDigits !== '' && line.quantity >= 1 && (!isNew || line.unitWord !== '')
  // typed quantity/cost would be lost by a stray tap: no backdrop or Escape dismissal; ← and Android back ask first when changed
  return (
    <BottomSheet labelledBy="line-title" dismissible={false}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button className="icon-btn" aria-label="Voltar" onClick={onBack}>←</button>
        <h2 id="line-title" className="sheet-title">{line.name}</h2>
      </div>
      {isNew && (
        <div className="stack">
          <span className="label">Unidade</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {unitWords.map((w) => <button key={w} className="seg" style={{ flex: '0 0 auto', padding: '0 1rem' }} aria-pressed={line.unitWord === w} onClick={() => setLine({ ...line, unitWord: w })}>{w}</button>)}
          </div>
        </div>
      )}
      <div className="stack">
        <span className="label">Quantidade</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="icon-btn" style={{ border: '1px solid var(--line-strong)' }} aria-label="Menos" onClick={() => setLine({ ...line, quantity: Math.max(1, line.quantity - 1) })}>−</button>
          <span className="num" style={{ fontSize: '1.4rem', fontWeight: 700, minWidth: '6rem', textAlign: 'center' }}>{line.quantity} {line.unitWord}</span>
          <button className="icon-btn" style={{ border: '1px solid var(--line-strong)' }} aria-label="Mais" onClick={() => setLine({ ...line, quantity: Math.min(9999, line.quantity + 1) })}>+</button>
        </div>
      </div>
      <div className="stack" style={{ gap: '0.25rem' }}>
        <span className="label">Quanto pagou por estas unidades</span>
        <AmountField label="Quanto pagou por estas unidades" value={line.costDigits} onChange={(v) => setLine({ ...line, costDigits: v })} placeholder="" symbol={symbol} />
        <span className="muted" style={{ fontSize: '0.875rem' }}>Total desta linha, não o preço de cada unidade.</span>
      </div>
      <button className="btn btn-primary" disabled={!ready} onClick={() => onSave(line)}>{editing ? 'Guardar alteração' : 'Adicionar à compra'}</button>
    </BottomSheet>
  )
}
