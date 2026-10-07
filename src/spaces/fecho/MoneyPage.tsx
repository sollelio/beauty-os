// Dinheiro do período (Slice 06 F6) with the reserve card of D1: Alocado neste período · Usado neste período ·
// Saldo da reserva, and the two flows Alocar à reserva / Usar a reserva (each through Confirmação necessária).
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { allocateReserve, fechoKeys, getMoneyReview, spendReserve, type MoneyReview } from '../../modules/period/api'
import { formatAmount, formatMoney, wholeUnitsToMinor } from '../../shared/money'
import { formatDayShort } from '../../shared/time'
import { AmountField } from '../../shared/ui/AmountField'
import { useFecho } from './fecho'
import { Boundary, FechoHeader, KV, Loading } from './ui'

function useMoney(p: string | null) {
  return useQuery({ queryKey: fechoKeys.money(p), queryFn: () => getMoneyReview(p) })
}

export function MoneyPage() {
  const org = useOrganization()
  const navigate = useNavigate()
  const { p, q, to } = useFecho()
  const money = useMoney(p)
  if (!q.data || !money.data) return <Loading q={q.isError ? q : money} />
  const f = q.data, d = money.data, pos = f.position
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const day = (iso: string) => formatDayShort(iso, org.timezone)
  const closed = f.period.state === 'fechado'
  const allocations = d.reserve.movements.filter((x) => x.kind === 'allocation').length

  return (
    <main className="app-main">
      <header className="stack" style={{ gap: '0.5rem' }}>
        <FechoHeader title="Dinheiro do período" back={() => navigate(to('/privado/fecho'))} />
        <h1 style={{ fontSize: '1.5rem' }}>{f.period.label}</h1>
        <span className="muted" style={{ fontSize: '0.875rem' }}>{d.expenses.length} despesas · {d.purchases.length} compras · {allocations} {allocations === 1 ? 'alocação' : 'alocações'} à reserva</span>
      </header>

      <section className="stack" style={{ gap: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="label">Despesas</span><strong className="num">{m(pos.expenses.total_minor)}</strong></div>
        {d.expenses.map((e) => (
          <div key={e.id} className="list-row">
            <span className="grow"><strong style={{ display: 'block' }}>{e.category}{e.note ? ` · ${e.note}` : ''}</strong>
              <span className="muted" style={{ fontSize: '0.8125rem' }}>{[day(e.occurred_at), e.method?.toLocaleLowerCase('pt-PT'), e.reserve_used_minor ? `pago pela reserva ${g(e.reserve_used_minor)}` : null].filter(Boolean).join(' · ')}</span></span>
            <span className="num" style={{ fontWeight: 600 }}>{m(e.amount_minor)}</span>
          </div>
        ))}
      </section>

      <section className="stack" style={{ gap: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="label">Compras</span><strong className="num">{m(pos.purchases.total_minor)}</strong></div>
        {d.purchases.map((x) => (
          <div key={x.id} className="list-row">
            <span className="grow"><strong style={{ display: 'block' }}>{[x.origin ?? 'Compra', `${x.line_count} ${x.line_count === 1 ? 'produto' : 'produtos'}`].join(' · ')}</strong>
              <span className="muted num" style={{ fontSize: '0.8125rem' }}>{[day(x.occurred_at), `Salão ${g(x.salon_minor)}`, ...x.contributors.map((c) => `${c.name} ${g(c.amount_minor)}`),
                ...(x.reserve_used_minor ? [`pago pela reserva ${g(x.reserve_used_minor)}`] : [])].join(' · ')}</span></span>
            <span className="num" style={{ fontWeight: 600 }}>{m(x.total_minor)}</span>
          </div>
        ))}
        <p className="muted num" style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem' }}>Parte do salão {g(pos.purchases.salon_minor)} · contribuições de pessoas {g(pos.purchases.contributions_minor)} (à parte, na situação de cada pessoa).</p>
      </section>

      <section className="stock-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }} aria-label="Reserva">
        <span className="label">Reserva</span>
        <KV rows={[['Alocado neste período', m(d.reserve.allocated_minor)], ['Usado neste período', m(d.reserve.used_minor)], ['Saldo da reserva', m(d.reserve.balance_minor)]]} />
        <span className="muted" style={{ fontSize: '0.8125rem' }}>Dinheiro do salão: não é despesa nem é distribuível.</span>
        {d.reserve.movements.map((x, i) => (
          <div key={i} className="list-row">
            <span className="grow"><strong style={{ display: 'block' }}>{x.kind === 'allocation' ? 'Alocação à reserva' : `Uso da reserva · ${x.target}`}</strong>
              <span className="muted" style={{ fontSize: '0.8125rem' }}>{[day(x.occurred_at), x.note, `confirmado por ${x.confirmed_by}`].filter(Boolean).join(' · ')}</span></span>
            <span className="num" style={{ fontWeight: 600 }}>{x.kind === 'allocation' ? m(x.amount_minor) : m(-x.amount_minor)}</span>
          </div>
        ))}
        {!closed && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={() => navigate(to('/privado/fecho/reserva/alocar'))}>Alocar à reserva</button>
            <button className="btn btn-secondary" disabled={d.reserve.balance_minor <= 0} onClick={() => navigate(to('/privado/fecho/reserva/usar'))}>Usar a reserva</button>
          </div>
        )}
      </section>

      <section className="stack" style={{ gap: 0 }}>
        <span className="label">Movimentos para a equipa</span>
        <div className="list-row"><span className="grow"><strong style={{ display: 'block' }}>Adiantamentos</strong><span className="muted" style={{ fontSize: '0.8125rem' }}>não são despesa</span></span><span className="num">{m(pos.advances_minor)}</span></div>
        <div className="list-row"><span className="grow"><strong style={{ display: 'block' }}>Pagamentos à equipa</strong><span className="muted" style={{ fontSize: '0.8125rem' }}>{pos.payments_minor ? 'confirmados' : 'nenhum confirmado ainda'}</span></span><span className="num">{m(pos.payments_minor)}</span></div>
      </section>
    </main>
  )
}

export function ReserveFlow() {
  const org = useOrganization()
  const navigate = useNavigate()
  const { mode } = useParams()
  const { p, q, to } = useFecho()
  const money = useMoney(p)
  const [step, setStep] = useState<1 | 2>(1)
  const [digits, setDigits] = useState('')
  const [note, setNote] = useState('')
  const [target, setTarget] = useState<{ kind: 'expense' | 'purchase'; id: string; label: string; left: number } | null>(null)
  if (!q.data || !money.data) return <Loading q={q.isError ? q : money} />
  const f = q.data, d: MoneyReview = money.data
  const m = (n: number) => formatMoney(n, org)
  const amount = wholeUnitsToMinor(digits, org) ?? 0
  const back = () => (step === 2 ? setStep(1) : navigate(to('/privado/fecho/dinheiro')))
  const done = () => navigate(to('/privado/fecho/dinheiro'))
  const allocating = mode === 'alocar'
  const options = [
    ...d.expenses.map((e) => ({ kind: 'expense' as const, id: e.id, label: e.category, left: e.amount_minor - e.reserve_used_minor })),
    ...d.purchases.map((x) => ({ kind: 'purchase' as const, id: x.id, label: `Compra · ${x.origin ?? ''}`.replace(/ · $/, ''), left: x.salon_minor - x.reserve_used_minor })),
  ].filter((o) => o.left > 0)
  const overBalance = !allocating && amount > d.reserve.balance_minor
  const overRecord = !allocating && target !== null && amount > target.left
  const ok = amount > 0 && (allocating || (target !== null && !overBalance && !overRecord))

  return (
    <main className="app-main">
      <FechoHeader title={allocating ? 'Alocar à reserva' : 'Usar a reserva'} back={back} />
      {step === 1 ? (
        <>
          <section className="stack" style={{ gap: '1rem' }}>
            {allocating ? (
              <>
                <span className="label">Valor a alocar</span>
                <AmountField label="Valor a alocar" value={digits} onChange={setDigits} symbol={org.currency_symbol} />
                <span className="label">Para quê (opcional)</span>
                <label className="field"><input aria-label="Para quê (opcional)" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} /></label>
              </>
            ) : (
              <>
                <span className="label">Que despesa ou compra foi paga pela reserva?</span>
                {options.length === 0 && <p className="muted">Não há despesas ou compras deste período por pagar pela reserva.</p>}
                {options.map((o) => (
                  <button key={o.id} className="pick" aria-pressed={target?.id === o.id}
                    onClick={() => { setTarget(o); setDigits(String(Math.round(Math.min(o.left, d.reserve.balance_minor) / 10 ** org.currency_exponent))) }}>
                    <strong>{o.label}</strong><span className="num muted">{o.kind === 'purchase' ? 'parte do salão ' : ''}{m(o.left)}</span>
                  </button>
                ))}
                {target && <AmountField label="Da reserva" value={digits} onChange={setDigits} symbol={org.currency_symbol} />}
                {overBalance && <span className="notice notice-warning">A reserva tem {m(d.reserve.balance_minor)}; o resto fica como despesa normal.</span>}
                {overRecord && target && <span className="notice notice-warning">Deste registo faltam {m(target.left)}.</span>}
              </>
            )}
          </section>
          <div className="footer"><button className="btn btn-primary btn-tall" disabled={!ok} onClick={() => setStep(2)}>Continuar</button></div>
        </>
      ) : allocating ? (
        <Boundary permission="period.decide" run={allocateReserve} input={{ periodId: f.period.id, amountMinor: amount, note: note.trim() || null }}
          intro="Esta alocação tem de ser confirmada por uma pessoa autorizada." label="Confirmar alocação" onSuccess={done} onBack={() => setStep(1)}
          lockNote="Fica no histórico com data, hora e quem confirmou. Não é despesa; continua a ser dinheiro do salão, não distribuível.">
          <KV rows={[['Valor', m(amount)], ['Período', f.period.label], ...(note.trim() ? [['Nota', note.trim()] as [string, string]] : [])]} />
        </Boundary>
      ) : target && (
        <Boundary permission="period.decide" run={spendReserve} input={{ expenseId: target.kind === 'expense' ? target.id : null, purchaseId: target.kind === 'purchase' ? target.id : null, amountMinor: amount }}
          intro="Este uso da reserva tem de ser confirmado por uma pessoa autorizada." label="Confirmar uso da reserva" onSuccess={done} onBack={() => setStep(1)}
          lockNote="Fica no histórico com data, hora e quem confirmou. Não é uma despesa nova: a despesa conta uma vez.">
          <KV rows={[['Despesa ou compra', target.label], ['Da reserva', m(amount)]]} />
        </Boundary>
      )}
    </main>
  )
}
