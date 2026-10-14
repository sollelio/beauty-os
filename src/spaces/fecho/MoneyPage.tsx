// Dinheiro do período (Slice 06 F6) with the reserve card of D1: Alocado neste período · Usado neste período ·
// Saldo da reserva, and the two flows Alocar à reserva / Usar a reserva (each through Confirmação necessária).
// On the mobile shell (UX slice 7): each expense or purchase that may still be cancelled is a whole row; its sheet
// holds "Anular registo", which opens the correction inside the private area (/privado/anular/…) so the private
// context is not ended by the correction and back returns here. The reserve flows' steps are history entries.
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { allocateReserve, fechoKeys, getMoneyReview, spendReserve, type MoneyReview } from '../../modules/period/api'
import { formatAmount, formatMoney, wholeUnitsToMinor } from '../../shared/money'
import { formatDayShort } from '../../shared/time'
import { AmountField } from '../../shared/ui/AmountField'
import { AppScreen, BottomActionBar } from '../../shared/ui/AppShell'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { Field } from '../../shared/ui/Field'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack, useFlow, useSheet } from '../../shared/ui/navigation'
import { EmptyState } from '../../shared/ui/states'
import { PrivateBar } from '../privado/PrivateBar'
import { useFecho } from './fecho'
import { BoundaryScreen, KV, Loading } from './ui'

function useMoney(p: string | null) {
  return useQuery({ queryKey: fechoKeys.money(p), queryFn: () => getMoneyReview(p) })
}

type MoneyRecord = { kind: 'expense' | 'purchase'; id: string; title: string; sub: string; amount: number }

export function MoneyPage() {
  const org = useOrganization()
  const navigate = useNavigate()
  const { p, q, to } = useFecho()
  const back = useAppBack(to('/privado/fecho'))
  const money = useMoney(p)
  const sheets = useSheet<MoneyRecord>()
  if (!q.data || !money.data) return <Loading q={q.isError ? q : money} title="Dinheiro do período" />
  const f = q.data, d = money.data, pos = f.position
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const day = (iso: string) => formatDayShort(iso, org.timezone)
  const closed = f.period.state === 'fechado'
  const open = f.period.state === 'aberto'
  const allocations = d.reserve.movements.filter((x) => x.kind === 'allocation').length
  const rec = sheets.current

  const recordRow = (r: MoneyRecord, cancellable: boolean) => {
    const slots = { title: r.title, subtitle: <span className="num">{r.sub}</span>, trailing: <span className="row-value num">{m(r.amount)}</span> }
    return cancellable
      ? <ListRow key={r.id} as="button" onClick={() => sheets.open(r)} chevron {...slots} />
      : <ListRow key={r.id} {...slots} />
  }

  return (
    <AppScreen bar={<PrivateBar title="Dinheiro do período" onBack={back} />}>
      <section className="stack stack-tight">
        <h1>{f.period.label}</h1>
        <span className="support">{d.expenses.length} despesas · {d.purchases.length} compras · {allocations} {allocations === 1 ? 'alocação' : 'alocações'} à reserva</span>
      </section>

      <section className="stack">
        <div className="row-between"><span className="label">Despesas</span><strong className="num">{m(pos.expenses.total_minor)}</strong></div>
        {d.expenses.length === 0 ? <EmptyState icon="receipt" title="Sem despesas neste período" /> : (
          <ListGroup>
            {d.expenses.map((e) => recordRow({
              kind: 'expense', id: e.id, title: `${e.category}${e.note ? ` · ${e.note}` : ''}`, amount: e.amount_minor,
              sub: [day(e.occurred_at), e.method?.toLocaleLowerCase('pt-PT'), e.reserve_used_minor ? `pago pela reserva ${g(e.reserve_used_minor)}` : null].filter(Boolean).join(' · '),
            }, open && !e.reserve_used_minor))}
          </ListGroup>
        )}
      </section>

      <section className="stack">
        <div className="row-between"><span className="label">Compras</span><strong className="num">{m(pos.purchases.total_minor)}</strong></div>
        {d.purchases.length === 0 ? <EmptyState icon="box" title="Sem compras neste período" /> : (
          <ListGroup>
            {d.purchases.map((x) => recordRow({
              kind: 'purchase', id: x.id, title: [x.origin ?? 'Compra', `${x.line_count} ${x.line_count === 1 ? 'produto' : 'produtos'}`].join(' · '), amount: x.total_minor,
              sub: [day(x.occurred_at), `Salão ${g(x.salon_minor)}`, ...x.contributors.map((c) => `${c.name} ${g(c.amount_minor)}`),
                ...(x.reserve_used_minor ? [`pago pela reserva ${g(x.reserve_used_minor)}`] : [])].join(' · '),
            }, open && !x.reserve_used_minor))}
          </ListGroup>
        )}
        <p className="note support num">Parte do salão {g(pos.purchases.salon_minor)} · contribuições de pessoas {g(pos.purchases.contributions_minor)} (à parte, na situação de cada pessoa).</p>
      </section>

      <section className="stack" aria-label="Reserva">
        <span className="label">Reserva</span>
        <KV rows={[['Alocado neste período', m(d.reserve.allocated_minor)], ['Usado neste período', m(d.reserve.used_minor)], ['Saldo da reserva', m(d.reserve.balance_minor)]]} />
        <span className="support">Dinheiro do salão: não é despesa nem é distribuível.</span>
        {d.reserve.movements.length > 0 && (
          <ListGroup>
            {d.reserve.movements.map((x, i) => (
              <ListRow key={i} title={x.kind === 'allocation' ? 'Alocação à reserva' : `Uso da reserva · ${x.target}`}
                subtitle={[day(x.occurred_at), x.note, `confirmado por ${x.confirmed_by}`].filter(Boolean).join(' · ')}
                trailing={<span className="row-value num">{x.kind === 'allocation' ? m(x.amount_minor) : m(-x.amount_minor)}</span>} />
            ))}
          </ListGroup>
        )}
        {!closed && (
          <div className="bar-actions">
            <button className="btn btn-secondary" onClick={() => navigate(to('/privado/fecho/reserva/alocar'))}>Alocar à reserva</button>
            <button className="btn btn-secondary" disabled={d.reserve.balance_minor <= 0} onClick={() => navigate(to('/privado/fecho/reserva/usar'))}>Usar a reserva</button>
          </div>
        )}
      </section>

      <section className="stack">
        <span className="label">Movimentos para a equipa</span>
        <ListGroup>
          <ListRow title="Adiantamentos" subtitle="não são despesa" trailing={<span className="row-value num">{m(pos.advances_minor)}</span>} />
          <ListRow title="Pagamentos à equipa" subtitle={pos.payments_minor ? 'confirmados' : 'nenhum confirmado ainda'} trailing={<span className="row-value num">{m(pos.payments_minor)}</span>} />
        </ListGroup>
      </section>

      {rec && (
        <BottomSheet labelledBy="rec-title" onDismiss={sheets.close}>
          <div className="row-between">
            <span className="stack stack-tight">
              <span className="label">{rec.kind === 'expense' ? 'Despesa' : 'Compra'}</span>
              <h2 id="rec-title" className="sheet-title">{rec.title}</h2>
            </span>
            <button className="icon-btn" aria-label="Fechar" onClick={sheets.close}><Icon name="close" /></button>
          </div>
          <KV rows={[['Valor', m(rec.amount)], ['Detalhe', rec.sub]]} />
          <p className="note support">Anular não apaga nada: o registo fica no histórico, marcado como anulado, e deixa de contar nos valores. Precisa de motivo e de confirmação.</p>
          <div className="sheet-actions">
            <button className="btn btn-secondary" data-autofocus onClick={sheets.close}>Fechar</button>
            <button className="btn btn-destructive" onClick={() => sheets.leaveTo(`/privado/anular/${rec.kind}/${rec.id}`)}>Anular registo</button>
          </div>
        </BottomSheet>
      )}
    </AppScreen>
  )
}

export function ReserveFlow() {
  const org = useOrganization()
  const { mode } = useParams()
  const { p, q, to } = useFecho()
  const money = useMoney(p)
  const [digits, setDigits] = useState('')
  const [note, setNote] = useState('')
  const [target, setTarget] = useState<{ kind: 'expense' | 'purchase'; id: string; label: string; left: number } | null>(null)
  const allocating = mode === 'alocar'
  const amount = wholeUnitsToMinor(digits, org) ?? 0
  const balance = money.data?.reserve.balance_minor ?? 0
  const overBalance = !allocating && amount > balance
  const overRecord = !allocating && target !== null && amount > target.left
  const ok = amount > 0 && (allocating || (target !== null && !overBalance && !overRecord))
  const parent = to('/privado/fecho/dinheiro')
  const flow = useFlow({ steps: 2, parent, dirty: digits !== '' || note !== '' || target !== null, reachable: () => ok })
  if (!q.data || !money.data) return <Loading q={q.isError ? q : money} title={allocating ? 'Alocar à reserva' : 'Usar a reserva'} />
  const f = q.data, d: MoneyReview = money.data
  const m = (n: number) => formatMoney(n, org)
  const done = () => flow.finishTo(parent)
  const options = [
    ...d.expenses.map((e) => ({ kind: 'expense' as const, id: e.id, label: e.category, left: e.amount_minor - e.reserve_used_minor })),
    ...d.purchases.map((x) => ({ kind: 'purchase' as const, id: x.id, label: `Compra · ${x.origin ?? ''}`.replace(/ · $/, ''), left: x.salon_minor - x.reserve_used_minor })),
  ].filter((o) => o.left > 0)
  const bar = <PrivateBar title={allocating ? 'Alocar à reserva' : 'Usar a reserva'} onBack={flow.step === 2 ? () => flow.goTo(1) : flow.exit}
    step={{ current: flow.step, total: 2 }} exit={false} />
  const discard = <DiscardSheet open={flow.discard.open} title="Sair sem registar?" detail="O que escreveu perde-se. Nada foi registado." onDiscard={flow.discard.confirm} onKeep={flow.discard.cancel} />

  if (flow.step === 2) {
    return (
      <>
        {allocating ? (
          <BoundaryScreen bar={bar} permission="period.decide" run={allocateReserve} input={{ periodId: f.period.id, amountMinor: amount, note: note.trim() || null }}
            intro="Esta alocação tem de ser confirmada por uma pessoa autorizada." label="Confirmar alocação" onSuccess={done} onBack={() => flow.goTo(1)}
            lockNote="Fica no histórico com data, hora e quem confirmou. Não é despesa; continua a ser dinheiro do salão, não distribuível.">
            <KV rows={[['Valor', m(amount)], ['Período', f.period.label], ...(note.trim() ? [['Nota', note.trim()] as [string, string]] : [])]} />
          </BoundaryScreen>
        ) : target && (
          <BoundaryScreen bar={bar} permission="period.decide" run={spendReserve} input={{ expenseId: target.kind === 'expense' ? target.id : null, purchaseId: target.kind === 'purchase' ? target.id : null, amountMinor: amount }}
            intro="Este uso da reserva tem de ser confirmado por uma pessoa autorizada." label="Confirmar uso da reserva" onSuccess={done} onBack={() => flow.goTo(1)}
            lockNote="Fica no histórico com data, hora e quem confirmou. Não é uma despesa nova: a despesa conta uma vez.">
            <KV rows={[['Despesa ou compra', target.label], ['Da reserva', m(amount)]]} />
          </BoundaryScreen>
        )}
        {discard}
      </>
    )
  }
  return (
    <AppScreen bar={bar}
      actions={<BottomActionBar><button className="btn btn-primary btn-tall" disabled={!ok} onClick={() => flow.goTo(2)}>Continuar</button></BottomActionBar>}>
      {allocating ? (
        <section className="stack stack-loose">
          <AmountField label="Valor a alocar" value={digits} onChange={setDigits} symbol={org.currency_symbol} />
          <Field label="Para quê (opcional)">
            <input maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </section>
      ) : (
        <section className="stack stack-loose">
          <span className="label">Que despesa ou compra foi paga pela reserva?</span>
          {options.length === 0 ? <EmptyState icon="receipt" title="Nada por pagar pela reserva">Não há despesas ou compras deste período por pagar pela reserva.</EmptyState> : (
            <ListGroup>
              {options.map((o) => (
                <ListRow key={o.id} as="button" current={target?.id === o.id} title={o.label}
                  onClick={() => { setTarget(o); setDigits(String(Math.round(Math.min(o.left, d.reserve.balance_minor) / 10 ** org.currency_exponent))) }}
                  trailing={<span className="row-value num">{o.kind === 'purchase' ? 'parte do salão ' : ''}{m(o.left)}</span>} />
              ))}
            </ListGroup>
          )}
          {target && <AmountField label="Da reserva" value={digits} onChange={setDigits} symbol={org.currency_symbol} />}
          {overBalance && <span className="notice notice-warning">A reserva tem {m(d.reserve.balance_minor)}; o resto fica como despesa normal.</span>}
          {overRecord && target && <span className="notice notice-warning">Deste registo faltam {m(target.left)}.</span>}
        </section>
      )}
      {discard}
    </AppScreen>
  )
}
