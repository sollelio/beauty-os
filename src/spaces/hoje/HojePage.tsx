// Hoje (Slice 01 §3): primary action, salon-level count line, recent records. No money totals, no per-person totals.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { getHojeSummary, servicesKeys } from '../../modules/services/api'
import { countLine } from './countLine'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { formatMoney } from '../../shared/money'
import { formatTime, formatToday } from '../../shared/time'

export function HojePage() {
  const org = useOrganization()
  const summary = useQuery({ queryKey: servicesKeys.hoje, queryFn: getHojeSummary })

  return (
    <main className="app-main">
      <header className="stack" style={{ gap: '0.25rem' }}>
        <span className="label">{formatToday(org.timezone)}</span>
        <h1>Hoje</h1>
      </header>

      <Link to="/servicos/registar" className="btn btn-primary btn-tall" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
        Registar serviço
      </Link>
      <nav className="quick-actions" aria-label="Outras ações">
        <Link to="/equipa/adiantamento">Adiantamento</Link>
      </nav>

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
                    <span className="num" style={{ fontWeight: 600 }}>{formatMoney(r.value_minor, org)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}
