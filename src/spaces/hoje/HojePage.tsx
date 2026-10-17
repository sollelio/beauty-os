// Hoje (Slice 01 §3): primary action, salon-level count line, recent records. No money totals, no per-person totals.
// Local work not yet on the server (ADR-0010 §11) shows as one row, only when there is some; its counts stay apart
// from the server's figures.
// Tenant Identity (T1, T3): the salon line names the organization this phone is bound to and opens «Este telemóvel»;
// the «Limiar» brand moment is presented here once per enrollment, and replayed from «Este telemóvel».
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'
import { readStoredPrincipal } from '../../modules/org/api'
import { useTenantMark } from '../../modules/org/tenantMark'
import { getHojeSummary, servicesKeys } from '../../modules/services/api'
import { countMarkedToBuy, stockKeys } from '../../modules/stock/api'
import { countLine } from './countLine'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { formatMoney } from '../../shared/money'
import { isOfflineMode, useOfflineRuntime } from '../../shared/offline/runtime'
import { pendingRows } from '../../shared/ui/offlineCopy'
import { SyncStatusSheet } from '../../shared/ui/OfflineStatus'
import { formatTime, formatToday } from '../../shared/time'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow, RowIcon } from '../../shared/ui/ListRow'
import { useSheet } from '../../shared/ui/navigation'
import { markPresented, prefersStill, shouldPresent } from './limiar/presentation'

// Capture flows opened from here go back here (history) when they finish or close (useFlow.leaveTo).
const FROM_HOJE = { from: '/' }

// The moment is its own chunk (never on the start path); if it cannot load, it is simply not shown.
const BrandMoment = lazy(() => import('./limiar/BrandMoment'))
class MomentBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

export function HojePage() {
  const org = useOrganization()
  const mark = useTenantMark()                             // the organization's logo on this phone, or null (name only)
  const summary = useQuery({ queryKey: servicesKeys.hoje, queryFn: getHojeSummary })
  const toBuy = useQuery({ queryKey: stockKeys.toBuy, queryFn: countMarkedToBuy })
  const chooser = useSheet<true>()
  const syncSheet = useSheet<true>()
  const runtime = useOfflineRuntime()
  const pending = pendingRows(runtime.local)
  const offline = isOfflineMode(runtime)

  // «Limiar»: its own history entry, so Android/browser back skips it like «Saltar»
  const moment = useSheet<{ still: boolean }>()
  const [assembling, setAssembling] = useState(false)       // Hoje assembles beneath the moment (motion only)
  const title = useRef<HTMLHeadingElement>(null)
  const presented = useRef(false)
  useEffect(() => {
    if (presented.current) return
    presented.current = true
    const principal = readStoredPrincipal()
    if (!principal || !shouldPresent(principal, org.id)) return
    markPresented(principal, org.id)                        // recorded as it starts: never presented twice
    moment.open({ still: prefersStill() })
  }, [org.id, moment])
  // replay from «Este telemóvel»: the sheet's history entry is gone first (the browser's back is asynchronous), then
  // the moment opens its own
  const replayQueued = useRef(false)
  const sheetEntry = (useLocation().state as { sheet?: string } | null)?.sheet
  useEffect(() => {
    if (!replayQueued.current || sheetEntry) return
    replayQueued.current = false
    moment.open({ still: prefersStill() })
  }, [sheetEntry, moment])
  const replay = () => { replayQueued.current = true; syncSheet.close() }
  const endMoment = () => { moment.close(); title.current?.focus() }

  return (
    <>
    <main className={assembling && moment.current ? 'app-main limiar-run' : 'app-main'}>
      <header className="stack stack-tight">
        <button type="button" className="tenant-line" onClick={() => syncSheet.open(true)} aria-label={`Este telemóvel: ligado a ${org.name}`}>
          {mark && <img className="tenant-mark" data-tenant-mark src={mark.src64} alt="" width={32} height={32} />}
          <span className="tenant-name">{org.name}</span>
        </button>
        <span className="label">{formatToday(org.timezone)}</span>
        <h1 ref={title} tabIndex={-1}>Hoje</h1>
      </header>

      <Link to="/servicos/registar" state={FROM_HOJE} className="btn btn-primary hoje-cta">
        <Icon name="plus" />Registar serviço
      </Link>
      <nav aria-label="Outras ações">
        <ListGroup>
          <ListRow as="link" to="/equipa/adiantamento" state={FROM_HOJE} leading={<RowIcon name="card" />} title="Adiantamento" chevron />
          <ListRow as="button" onClick={() => chooser.open(true)} leading={<RowIcon name="receipt" />} title="Despesa ou compra" chevron />
          <ListRow as="link" to="/stock" leading={<RowIcon name="box" />} title="Stock" chevron />
        </ListGroup>
      </nav>

      {(pending.send || pending.confirm || pending.review) && (
        // work on this phone, never mixed into the server's figures: to send, to confirm with PIN, to review
        <section className="stack" aria-label="Neste telemóvel">
          <ListGroup>
            {pending.send && <ListRow as="button" onClick={() => syncSheet.open(true)} leading={<RowIcon name="clock" tone="quiet" />} chevron title={pending.send} />}
            {pending.confirm && <ListRow as="link" to="/rascunhos" leading={<RowIcon name="lock" tone="quiet" />} chevron title={pending.confirm} />}
            {pending.review && <ListRow as="link" to="/rever" leading={<RowIcon name="alert" tone="warning" />} chevron title={pending.review} />}
          </ListGroup>
        </section>
      )}

      {(toBuy.data ?? 0) > 0 && (
        <section className="stack" aria-label="Atenção">
          <span className="label">Atenção</span>
          <ListGroup>
            <ListRow as="link" to="/stock" leading={<RowIcon name="alert" tone="warning" />} chevron
              title={`${toBuy.data} ${toBuy.data === 1 ? 'produto marcado' : 'produtos marcados'} a comprar`} />
          </ListGroup>
        </section>
      )}

      <section className="stack" aria-labelledby="hoje-private">
        <span className="label group-label" id="hoje-private"><Icon name="lock" size={14} />Privado · com PIN</span>
        <nav aria-label="Privado">
          <ListGroup>
            <ListRow as="link" to="/privado/entrar" leading={<RowIcon name="person" tone="quiet" />} title="Área privada" chevron />
            <ListRow as="link" to="/privado/fecho" leading={<RowIcon name="calendarCheck" tone="quiet" />} title="Fecho" chevron />
            <ListRow as="link" to="/privado/negocio" leading={<RowIcon name="chart" tone="quiet" />} title="Negócio" chevron />
          </ListGroup>
        </nav>
      </section>

      {summary.isError && offline && !summary.data && (
        // no server figures on this device (e.g. opened without a connection): say so, never show 0 as if it were true
        <p className="note" data-testid="hoje-offline-note">Sem ligação: os registos de hoje aparecem quando houver ligação.</p>
      )}
      {summary.isError && !offline && (
        <div className="notice notice-error" role="alert">
          Não foi possível carregar os registos de hoje. <button className="link-btn" onClick={() => summary.refetch()}>Tentar novamente</button>
        </div>
      )}

      {summary.data && (
        <>
          <p className="note num" data-testid="count-line">{countLine(summary.data, org.timezone)}</p>
          {offline && summary.dataUpdatedAt > 0 && (
            // the server's figures as last read; work saved on this phone is counted apart, above
            <p className="support num" data-testid="hoje-updated">Atualizado às {formatTime(new Date(summary.dataUpdatedAt).toISOString(), org.timezone)}</p>
          )}
          {summary.data.recent.length > 0 && (
            <section className="stack" aria-label="Recentes">
              <span className="label">Recentes</span>
              <ListGroup>
                {summary.data.recent.map((r) => (
                  <ListRow key={r.id} leading={<span className="row-time num">{formatTime(r.occurred_at, org.timezone)}</span>}
                    title={r.service_name} subtitle={`${r.person_name} · ${r.payment_kind === 'mixed' ? 'Misto' : r.method_label}`}
                    trailing={<span className="row-value num">{formatMoney(r.value_minor, org)}</span>} />
                ))}
              </ListGroup>
            </section>
          )}
        </>
      )}
      {/* Ajuda (learning experience L2): one quiet row after everything operational; written help, also offline */}
      <nav aria-label="Ajuda">
        <ListGroup>
          <ListRow as="link" to="/ajuda" leading={<RowIcon name="help" tone="quiet" />} title="Ajuda" subtitle="Passo a passo do Beauty OS" chevron />
        </ListGroup>
      </nav>
      {syncSheet.current && <SyncStatusSheet onDismiss={syncSheet.close} onReplay={replay} />}
      {chooser.current && (
        // choosing replaces the sheet's history entry with the flow, so back from the flow returns to Hoje
        <BottomSheet labelledBy="chooser-title" onDismiss={chooser.close}>
          <h2 id="chooser-title" className="sheet-title">O que quer registar?</h2>
          <ListGroup>
            <ListRow as="button" onClick={() => chooser.leaveTo('/dinheiro/despesa', FROM_HOJE)} leading={<RowIcon name="receipt" />} chevron
              title="Registar despesa" subtitle="Contas e gastos do salão — não entra no stock" />
            <ListRow as="button" onClick={() => chooser.leaveTo('/dinheiro/compra', FROM_HOJE)} leading={<RowIcon name="box" />} chevron
              title="Registar compra" subtitle="Produtos que usamos nos serviços e ficam no stock" />
          </ListGroup>
          <button className="btn btn-secondary" onClick={chooser.close}>Cancelar</button>
        </BottomSheet>
      )}
    </main>
    {moment.current && (
      <MomentBoundary onError={moment.close}>
        <Suspense fallback={null}>
          <BrandMoment name={org.name} mark={mark} still={moment.current.still} onDone={endMoment} onRunning={setAssembling} />
        </Suspense>
      </MomentBoundary>
    )}
    </>
  )
}
