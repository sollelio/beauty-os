// Hoje (Slice 01 §3): primary action, salon-level count line, recent records. No money totals, no per-person totals.
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { getHojeSummary, servicesKeys } from '../../modules/services/api'
import { countMarkedToBuy, stockKeys } from '../../modules/stock/api'
import { countLine } from './countLine'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { formatMoney } from '../../shared/money'
import { formatTime, formatToday } from '../../shared/time'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { useSheet } from '../../shared/ui/navigation'

// Capture flows opened from here go back here (history) when they finish or close (useFlow.leaveTo).
const FROM_HOJE = { from: '/' }

// Small stroke icons for the Hoje actions (no icon library in the app; currentColor, decorative only).
const icon = (paths: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">{paths}</svg>
)
const icons = {
  plus: icon(<path d="M12 5v14M5 12h14" />),
  advance: icon(<><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>),
  expense: icon(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>),
  stock: icon(<><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>),
  person: icon(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  close: icon(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4" /></>),
  business: icon(<path d="M3 21h18M6 17v-6M12 17V5M18 17v-9" />),
  lock: icon(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
}

function ActionContent({ glyph, label, quiet }: { glyph: ReactNode; label: string; quiet?: boolean }) {
  return (
    <>
      <span className={quiet ? 'action-icon action-icon-quiet' : 'action-icon'}>{glyph}</span>
      <span className="action-label">{label}</span>
      <span aria-hidden className="action-chevron">›</span>
    </>
  )
}

export function HojePage() {
  const org = useOrganization()
  const summary = useQuery({ queryKey: servicesKeys.hoje, queryFn: getHojeSummary })
  const toBuy = useQuery({ queryKey: stockKeys.toBuy, queryFn: countMarkedToBuy })
  const chooser = useSheet<true>()

  return (
    <main className="app-main">
      <header className="stack" style={{ gap: '0.25rem' }}>
        <span className="label">{formatToday(org.timezone)}</span>
        <h1>Hoje</h1>
      </header>

      <Link to="/servicos/registar" state={FROM_HOJE} className="btn btn-primary hoje-cta">
        {icons.plus}Registar serviço
      </Link>
      <nav className="action-card" aria-label="Outras ações">
        <Link to="/equipa/adiantamento" state={FROM_HOJE} className="action-row"><ActionContent glyph={icons.advance} label="Adiantamento" /></Link>
        <button className="action-row" onClick={() => chooser.open(true)}><ActionContent glyph={icons.expense} label="Despesa ou compra" /></button>
        <Link to="/stock" className="action-row"><ActionContent glyph={icons.stock} label="Stock" /></Link>
      </nav>

      {(toBuy.data ?? 0) > 0 && (
        <section className="stack" aria-label="Atenção">
          <span className="label">Atenção</span>
          <Link to="/stock" className="pick" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span>{toBuy.data} {toBuy.data === 1 ? 'produto marcado' : 'produtos marcados'} a comprar</span><span aria-hidden className="muted">›</span>
          </Link>
        </section>
      )}

      <section className="stack" aria-labelledby="hoje-private">
        <span className="label action-group-label" id="hoje-private">{icons.lock}Privado · com PIN</span>
        <nav className="action-card" aria-label="Privado">
          <Link to="/privado/entrar" className="action-row"><ActionContent glyph={icons.person} label="Área privada" quiet /></Link>
          <Link to="/privado/fecho" className="action-row"><ActionContent glyph={icons.close} label="Fecho" quiet /></Link>
          <Link to="/privado/negocio" className="action-row"><ActionContent glyph={icons.business} label="Negócio" quiet /></Link>
        </nav>
      </section>

      {summary.isError && (
        <div className="notice notice-error" role="alert">
          Não foi possível carregar os registos de hoje. <button className="link-btn" onClick={() => summary.refetch()}>Tentar novamente</button>
        </div>
      )}

      {summary.data && (
        <>
          <p className="muted num" style={{ margin: 0 }} data-testid="count-line">{countLine(summary.data, org.timezone)}</p>
          {summary.data.recent.length > 0 && (
            <section className="stack" aria-label="Recentes">
              <span className="label">Recentes</span>
              <div className="list">
                {summary.data.recent.map((r) => (
                  <div className="list-row" key={r.id}>
                    <span className="num muted" style={{ width: '3rem' }}>{formatTime(r.occurred_at, org.timezone)}</span>
                    <span className="grow">
                      <strong>{r.service_name}</strong>
                      <span className="muted" style={{ display: 'block', fontSize: '0.9rem' }}>
                        {r.person_name} · {r.payment_kind === 'mixed' ? 'Misto' : r.method_label}
                      </span>
                    </span>
                    <span className="num" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatMoney(r.value_minor, org)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {chooser.current && (
        // choosing replaces the sheet's history entry with the flow, so back from the flow returns to Hoje
        <BottomSheet labelledBy="chooser-title" onDismiss={chooser.close}>
          <h2 id="chooser-title" className="sheet-title">O que quer registar?</h2>
          <button className="pick" style={{ minHeight: '4.5rem' }} onClick={() => chooser.leaveTo('/dinheiro/despesa', FROM_HOJE)}>
            <span><strong style={{ display: 'block' }}>Registar despesa</strong><span className="muted">Contas e gastos do salão — não entra no stock</span></span>
          </button>
          <button className="pick" style={{ minHeight: '4.5rem' }} onClick={() => chooser.leaveTo('/dinheiro/compra', FROM_HOJE)}>
            <span><strong style={{ display: 'block' }}>Registar compra</strong><span className="muted">Produtos que usamos nos serviços e ficam no stock</span></span>
          </button>
          <button className="btn btn-secondary" onClick={chooser.close}>Cancelar</button>
        </BottomSheet>
      )}
    </main>
  )
}
