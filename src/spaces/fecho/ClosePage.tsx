// Fechar período (Slice 06 F13 / E1 blocked / E3 error) and Decisões e histórico (F15).
// Close is blocked while any approved amount is unpaid (04 J5 Decided); a missing owners' decision only warns (07 I5).
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { closePeriod, fechoKeys, getFechoHistory, type HistoryEntry } from '../../modules/period/api'
import { formatAmount, formatMoney } from '../../shared/money'
import { dayKey, formatDayShort, formatTime } from '../../shared/time'
import { rangeLabel, useFecho } from './fecho'
import { Boundary, FechoHeader, KV, Loading } from './ui'

export function ClosePage() {
  const org = useOrganization()
  const navigate = useNavigate()
  const { q, to } = useFecho()
  if (!q.data) return <Loading q={q} />
  const f = q.data, pos = f.position, a = f.approval
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const back = () => navigate(to('/privado/fecho'))
  if (f.period.state === 'fechado' || !a) {
    return (
      <main className="app-main">
        <FechoHeader title="Fechar período" back={back} />
        <div className="notice notice-warning">{f.period.state === 'fechado' ? 'Este período já está fechado.' : 'Só pode fechar depois de aprovar os valores a pagar.'}</div>
        <button className="btn btn-secondary" onClick={back}>Voltar ao Fecho</button>
      </main>
    )
  }
  const lines = a.lines.filter((l) => l.approved_minor > 0)
  const unpaid = lines.filter((l) => l.outstanding_minor > 0)
  const paid = lines.length - unpaid.length
  const nothing = a.lines.filter((l) => l.approved_minor === 0 && l.excess_minor > 0)
  const blocked = unpaid.length > 0
  const rows: [string, string][] = [
    ['Período', `${f.period.label} · ${rangeLabel(f.period.starts_on, f.period.ends_on, org.timezone)}`],
    ['Pagamentos', `${paid} de ${lines.length} pagos · ${g(a.paid_minor)}${blocked ? ` · por pagar ${m(a.outstanding_minor)}` : ' · 0 por pagar'}`],
    ...(nothing.length ? [['Nada a pagar', nothing.map((l) => `${l.display_name} · adiantamentos acima do ganho ${g(l.excess_minor)}`).join(' · ')] as [string, string]] : []),
    ['Distribuição aos sócios', pos.owners_decision ? `${pos.owners_decision.kind === 'none' ? 'Sem distribuição' : m(pos.distribution_minor ?? 0)} · ${pos.owners_decision.decided_by}` : 'Sem decisão registada'],
    ['Não distribuído', pos.undistributed_minor === null ? '—' : m(pos.undistributed_minor)],
    ['Reserva alocada', m(pos.reserve_allocated_minor)],
  ]
  return (
    <main className="app-main">
      <FechoHeader title="Fechar período" back={back} />
      {blocked && (
        <div className="notice notice-warning" role="status"><strong style={{ display: 'block' }}>Ainda há {unpaid.length} {unpaid.length === 1 ? 'pagamento' : 'pagamentos'} por confirmar</strong>
          {unpaid.map((l) => `${l.display_name} · ${m(l.outstanding_minor)}`).join(' · ')}. O período só fecha com todos os pagamentos aprovados confirmados.</div>
      )}
      {!pos.owners_decision && <div className="notice notice-neutral">Ainda sem decisão dos sócios: fica registado «sem decisão» ao fechar.</div>}
      <Boundary permission="period.close" run={closePeriod} input={{ periodId: f.period.id, revision: f.review_revision }} blocked={blocked}
        intro="Depois de fechado, o período fica só de leitura. Alterações só por reabertura autorizada, com motivo e registo de quem."
        lockNote="Fica no histórico com quem fechou e quando." label="Fechar período" onSuccess={back} onBack={back}>
        <KV rows={rows} />
      </Boundary>
      {blocked && (
        <div className="footer">
          <button className="btn btn-primary btn-tall" disabled>Fechar período</button>
          <button className="btn btn-secondary" onClick={() => navigate(to('/privado/fecho/pagamentos'))}>Ir aos pagamentos</button>
        </div>
      )}
    </main>
  )
}

const pct = (n: unknown) => `${String(Number(n)).replace('.', ',')}%`

export function HistoryPage() {
  const org = useOrganization()
  const navigate = useNavigate()
  const { p, q, to } = useFecho()
  const h = useQuery({ queryKey: fechoKeys.history(p), queryFn: () => getFechoHistory(p) })
  if (!q.data || !h.data) return <Loading q={q.isError ? q : h} />
  const m = (n: unknown) => formatMoney(Number(n), org)
  const entry = (e: HistoryEntry): [string, string] => {
    switch (e.kind) {
      case 'rule': return e.previous_percent !== null && e.previous_percent !== undefined
        ? [`Regra alterada · ${e.person}`, `de ${pct(e.previous_percent)} para ${pct(e.percent)} · por ${e.by}`]
        : [`Regra do período · ${e.person}`, `${pct(e.percent)} para ${e.person} · definida por ${e.by}`]
      case 'owners_decision': return ['Decisão dos sócios', `${e.decision === 'none' ? 'Sem distribuição' : `Distribuição ${m(e.amount_minor)}`} · registada por ${e.by}`]
      case 'reserve_allocation': return ['Alocação à reserva', `${m(e.amount_minor)}${e.note ? ` · ${e.note}` : ''} · confirmado por ${e.by}`]
      case 'reserve_use': return ['Uso da reserva', `${m(e.amount_minor)} · confirmado por ${e.by}`]
      case 'approval': {
        const cases = (e.cases as { display_name: string }[]) ?? []
        return ['Valores a pagar aprovados', `${e.people} pessoas · ${m(e.total_minor)}${cases.length ? ` · ${cases.map((c) => c.display_name).join(', ')} nada a pagar` : ''} · aprovado por ${e.by}`]
      }
      case 'annulment': return ['Aprovação anulada', `por ${e.by}`]
      case 'reopen': return ['Período reaberto', `motivo: ${e.reason} · reaberto por ${e.by}`]
      case 'payment': return [`Pagamento · ${e.person}`, `${m(e.amount_minor)} · ${String(e.method).toLocaleLowerCase('pt-PT')} · confirmado por ${e.by}`]
      case 'close': return ['Período fechado', `${e.payments_count} pagamentos · ${m(e.paid_minor)}${e.distribution_minor !== null && e.distribution_minor !== undefined ? ` · distribuição ${m(e.distribution_minor)}` : ''} · fechado por ${e.by}`]
      default: return [e.kind, `por ${e.by}`]
    }
  }
  const days: { key: string; rows: HistoryEntry[] }[] = []
  for (const e of h.data) {
    const k = dayKey(e.at, org.timezone)
    if (days.at(-1)?.key !== k) days.push({ key: k, rows: [] })
    days.at(-1)!.rows.push(e)
  }
  return (
    <main className="app-main">
      <header className="stack" style={{ gap: '0.5rem' }}>
        <FechoHeader title="Decisões e histórico" back={() => navigate(to('/privado/fecho'))} />
        <h1 style={{ fontSize: '1.5rem' }}>{q.data.period.label}</h1>
        <span className="muted" style={{ fontSize: '0.875rem' }}>{h.data.length} {h.data.length === 1 ? 'decisão' : 'decisões'} do fecho · serviços, adiantamentos, despesas e compras ficam nos seus espaços</span>
      </header>
      {h.data.length === 0 && <p className="muted">Ainda não há decisões neste período.</p>}
      {days.map((d) => (
        <section key={d.key} className="list" data-testid="history-day">
          <span className="label" style={{ padding: '0.375rem 0' }}>{formatDayShort(d.key, org.timezone)}</span>
          {d.rows.map((e, i) => {
            const [title, sub] = entry(e)
            return (
              <div key={i} className="list-row">
                <span className="num muted" style={{ width: '2.75rem', fontSize: '0.875rem' }}>{formatTime(e.at, org.timezone)}</span>
                <span className="grow"><strong style={{ display: 'block' }}>{title}</strong><span className="muted num" style={{ fontSize: '0.8125rem' }}>{sub}</span></span>
              </div>
            )
          })}
        </section>
      ))}
    </main>
  )
}
