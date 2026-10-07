// Profissionais (Slice 06 F3) with the review sheets (F4 determinate · F4b advances above earned). A pending person
// shows "—", never 0. "Ver situação completa" hands off to Slice 04.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useOrganization } from '../../modules/org/OrganizationContext'
import type { PersonFigures } from '../../modules/period/api'
import { formatAmount, formatMoney } from '../../shared/money'
import { formatDayShort } from '../../shared/time'
import { stateLine, useFecho } from './fecho'
import { FechoHeader, Loading, Pill } from './ui'

const pct = (n: number | null) => `${String(Number(n)).replace('.', ',')}%`

export function ProfessionalsPage() {
  const org = useOrganization()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const { q, to } = useFecho()
  const [open, setOpen] = useState<string | null>(sp.get('pessoa'))
  if (!q.data) return <Loading q={q} />
  const f = q.data
  const g = (n: number) => formatAmount(n, org)
  const people = f.position.people
  const pending = people.filter((x) => x.earned_minor === null)
  const person = people.find((x) => x.person_id === open)

  const derivation = (x: PersonFigures) => {
    if (x.earned_minor === null) {
      return `Regra por definir · ${x.production.count} serviços ${g(x.production.total_minor)} · ${x.advances.count ? `adiant. ${g(x.advances.total_minor)}` : 'sem adiantamentos'}${x.is_owner ? ' · sócio' : ''}`
    }
    const base = `${pct(x.rule.percent)} · ganho ${g(x.earned_minor)} − adiant. ${g(x.advances.total_minor)}${x.payments.count ? ` − pagos ${g(x.payments.total_minor)}` : ''}`
    if ((x.excess_minor ?? 0) > 0) return `${base} = ${g(x.difference_minor ?? 0)} · nada a pagar`
    return `${base}${x.contributions.count ? ` · contribuição ${g(x.contributions.total_minor)} à parte` : ''}`
  }

  return (
    <main className="app-main">
      <header className="stack" style={{ gap: '0.5rem' }}>
        <FechoHeader title="Profissionais" back={() => navigate(to('/privado/fecho'))} />
        <h1 style={{ fontSize: '1.5rem' }}>{stateLine(f)}</h1>
        <span className="muted" style={{ fontSize: '0.875rem' }}>Toque num nome para rever os valores.</span>
      </header>
      <section className="stack" style={{ gap: 0 }}>
        {people.map((x) => {
          const pill = x.earned_minor === null ? <Pill kind="block">Decidir</Pill> : (x.excess_minor ?? 0) > 0 ? <Pill kind="review">A rever</Pill> : <Pill kind="ok">Pronto</Pill>
          return (
            <button key={x.person_id} className="prow" onClick={() => (x.earned_minor === null && f.period.state === 'aberto' ? navigate(to(`/privado/fecho/regra/${x.person_id}`)) : setOpen(x.person_id))}>
              <span className="avatar" aria-hidden>{x.display_name.slice(0, 1)}</span>
              <span className="grow"><span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><strong>{x.display_name}</strong>{pill}</span>
                <span className="muted num" style={{ display: 'block', fontSize: '0.8125rem' }}>{derivation(x)}</span></span>
              <span className={`num amount-cell${x.earned_minor === null ? ' tone-warning' : (x.remaining_minor ?? 0) === 0 ? ' tone-muted' : ''}`}>
                {x.earned_minor === null ? '—' : formatMoney(x.remaining_minor ?? 0, org)}</span>
            </button>
          )
        })}
        <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.875rem' }}>Cada valor é a soma dos registos do período. Um valor «—» não é zero: ainda não existe até a regra ser definida.</p>
      </section>
      {f.period.state === 'aberto' && (
        <div className="footer">
          <div style={{ display: 'flex', justifyContent: 'space-between' }} className="num"><span className="muted">A pagar · definido</span><strong>{formatMoney(f.position.payable_minor, org)}</strong></div>
          <button className="btn btn-primary" disabled={!f.readiness.can_approve} onClick={() => navigate(to('/privado/fecho/aprovar'))}>Aprovar valores a pagar</button>
          {pending.length > 0 && <span className="muted" style={{ textAlign: 'center', fontSize: '0.8125rem' }}>Defina as regras de {pending.map((x) => x.display_name).join(' e ')} para aprovar.</span>}
        </div>
      )}
      {person && <ReviewSheet x={person} f={f.period.state} periodLabel={f.period.label} onClose={() => setOpen(null)}
        onChangeRule={() => navigate(to(`/privado/fecho/regra/${person.person_id}`))} onFull={() => navigate(`/privado/situacao/${person.person_id}?p=${f.period.id}`)} />}
    </main>
  )
}

function ReviewSheet({ x, f, periodLabel, onClose, onChangeRule, onFull }: { x: PersonFigures; f: string; periodLabel: string; onClose: () => void; onChangeRule: () => void; onFull: () => void }) {
  const org = useOrganization()
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const excess = (x.excess_minor ?? 0) > 0
  return (
    <div className="sheet" role="dialog" aria-labelledby="rv-title" onClick={onClose}>
      <div className="sheet-body" style={{ maxHeight: '92dvh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="flow-header-row"><h2 id="rv-title" style={{ fontSize: '1.25rem' }}>{x.display_name} · {periodLabel}</h2><button className="icon-btn" aria-label="Fechar" onClick={onClose}>×</button></div>
        {excess && (
          <div className="notice notice-warning" role="status">Ganhou menos do que recebeu em adiantamentos: {m(x.excess_minor ?? 0)} entregues acima do ganho. Nada a pagar neste período. Esse valor já saiu do salão e não fica registado como ganho, dívida nem crédito; o que fazer com ele é decisão da gestão, ainda em aberto.</div>
        )}
        <dl className="kv-card">
          <div><dt>Produção</dt><dd className="num">{x.production.count} serviços · {m(x.production.total_minor)}</dd></div>
          <div><dt>Regra deste período</dt><dd className="num">{x.rule.percent === null ? 'Ainda não definida' : `${pct(x.rule.percent)} para ${x.display_name} · ${pct(x.rule.salon_percent)} salão${x.rule.set_by ? ` · ${x.rule.set_by}` : ''}${x.rule.set_at ? ` · ${formatDayShort(x.rule.set_at, org.timezone)}` : ''}`}</dd></div>
          <div><dt>Ganho</dt><dd className="num">{x.earned_minor === null ? '—' : m(x.earned_minor)}</dd></div>
          <div><dt>Adiantamentos · {x.advances.count}</dt><dd className="num">{x.advances.count ? m(-x.advances.total_minor) : '—'}</dd></div>
          <div><dt>Pagamentos</dt><dd className="num">{x.payments.count ? m(-x.payments.total_minor) : '—'}</dd></div>
          <div><dt><strong>Falta receber</strong>{excess && <span className="muted num" style={{ display: 'block', fontSize: '0.8125rem' }}>{g(x.earned_minor ?? 0)} − {g(x.advances.total_minor)}{x.payments.count ? ` − ${g(x.payments.total_minor)}` : ''} = {g(x.difference_minor ?? 0)} → mostra 0</span>}</dt>
            <dd className="num" style={{ fontSize: '1.25rem', fontWeight: 700 }}>{x.remaining_minor === null ? '—' : m(x.remaining_minor)}</dd></div>
        </dl>
        {x.contributions.count > 0 && <p className="muted num" style={{ margin: 0, fontSize: '0.875rem' }}>À parte: contribuições em compras {m(x.contributions.total_minor)} ({x.contributions.count} {x.contributions.count === 1 ? 'compra' : 'compras'}). Não é descontado nem somado ao valor a receber.</p>}
        {x.rule.kind === 'contextual' && x.rule.decided && f === 'aberto' && <button className="btn btn-secondary" onClick={onChangeRule}>Alterar regra do período</button>}
        <button className="btn btn-secondary" onClick={onFull}>Ver situação completa</button>
      </div>
    </div>
  )
}
