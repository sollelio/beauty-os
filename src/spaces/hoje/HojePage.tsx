// Hoje (Slice 01 §3): primary action, salon-level count line, recent records. No money totals, no per-person totals.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { getHojeSummary, servicesKeys } from '../../modules/services/api'
import { countMarkedToBuy, stockKeys } from '../../modules/stock/api'
import { countLine } from './countLine'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { formatMoney } from '../../shared/money'
import { formatTime, formatToday } from '../../shared/time'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow, RowIcon } from '../../shared/ui/ListRow'
import { useSheet } from '../../shared/ui/navigation'

// Capture flows opened from here go back here (history) when they finish or close (useFlow.leaveTo).
const FROM_HOJE = { from: '/' }

export function HojePage() {
  const org = useOrganization()
  const summary = useQuery({ queryKey: servicesKeys.hoje, queryFn: getHojeSummary })
  const toBuy = useQuery({ queryKey: stockKeys.toBuy, queryFn: countMarkedToBuy })
  const chooser = useSheet<true>()

  return (
    <main className="app-main">
      <header className="stack stack-tight">
        <span className="label">{formatToday(org.timezone)}</span>
        <h1>Hoje</h1>
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

      {summary.isError && (
        <div className="notice notice-error" role="alert">
          Não foi possível carregar os registos de hoje. <button className="link-btn" onClick={() => summary.refetch()}>Tentar novamente</button>
        </div>
      )}

      {summary.data && (
        <>
          <p className="note num" data-testid="count-line">{countLine(summary.data, org.timezone)}</p>
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
  )
}
