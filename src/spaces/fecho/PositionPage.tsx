// Posição do período (Slice 06 F7 + D1 row) with its numbered explanation (F7b) and the owners' decision (F8, D3).
// Livre is this period's free amount, not a cash balance (07 I10). "Lucro" is never a label.
// On the mobile shell (UX slice 7): the livre figure is the money headline (tap for the explanation), the breakdown
// is one group of value rows, both sheets are history entries, and a typed decision is not dropped by back unasked.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { fechoKeys, getDistributionPreview, recordOwnersDecision, type Fecho } from '../../modules/period/api'
import { formatAmount, formatMoney, wholeUnitsToMinor } from '../../shared/money'
import { AmountField } from '../../shared/ui/AmountField'
import { AppScreen } from '../../shared/ui/AppShell'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack } from '../../shared/ui/navigation'
import { SegmentedControl } from '../../shared/ui/SegmentedControl'
import { PrivateBar } from '../privado/PrivateBar'
import { stateLine, useFecho, when } from './fecho'
import { KV, Loading, SheetBoundary } from './ui'
import { useDraftSheet } from './hooks'

export function PositionPage() {
  const org = useOrganization()
  const navigate = useNavigate()
  const { q, to } = useFecho()
  const back = useAppBack(to('/privado/fecho'))
  const sheets = useDraftSheet<'explain' | 'decide'>(to('/privado/fecho'), 'Descartar a decisão?')
  if (!q.data) return <Loading q={q} title="Posição do período" />
  const f = q.data, pos = f.position
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const over = pos.people.filter((x) => (x.excess_minor ?? 0) > 0)
  const closed = f.period.state === 'fechado'
  const row = (title: string, sub: string, value: string, onOpen?: () => void) => {
    const slots = { title, subtitle: <span className="num">{sub}</span>, trailing: <span className="row-value num">{value}</span> }
    return onOpen ? <ListRow key={title} as="button" onClick={onOpen} chevron {...slots} /> : <ListRow key={title} {...slots} />
  }

  return (
    <AppScreen bar={<PrivateBar title="Posição do período" onBack={back} />}>
      <section className="stack stack-tight">
        <h1>{stateLine(f)}</h1>
        <span className="support">{pos.pending.length ? `${pos.pending.length} ${pos.pending.length === 1 ? 'regra' : 'regras'} por definir` : 'todas as regras definidas'}</span>
      </section>

      <button className="money-headline row-tappable" onClick={() => sheets.open('explain')}>
        <span className="label">Livre para decisão dos sócios · deste período</span>
        <span className="amount" data-testid="livre">{pos.livre_minor === null ? '—' : m(pos.livre_minor)}</span>
        <span className="support">= produção − ganhos da equipa − despesas − compras (salão) − reserva alocada{pos.reserve_used_minor ? ' + pago pela reserva' : ''} − entregue acima do ganho</span>
        <span className="money-link">Como se chega a este valor?<Icon name="chevronRight" size={18} /></span>
      </button>
      {pos.livre_minor !== null && pos.livre_minor < 0 && <div className="notice notice-warning">O valor livre deste período é negativo. Fica para rever.</div>}

      <ListGroup aria-label="Composição">
        {row('Produção', `${pos.production.count} serviços registados`, m(pos.production.total_minor))}
        {row('Ganhos da equipa', pos.pending.length ? `sem ${pos.pending.map((x) => x.display_name).join(' e ')} (regra por definir)` : 'segundo a regra de cada pessoa', m(-pos.team_earned_minor))}
        {row('Despesas', `${pos.expenses.count} despesas`, m(-pos.expenses.total_minor))}
        {row('Compras (salão)', `${g(pos.purchases.total_minor)} − contribuições ${g(pos.purchases.contributions_minor)}`, m(-pos.purchases.salon_minor))}
        {row('Reserva alocada', 'dinheiro do salão · não distribuível', m(-pos.reserve_allocated_minor))}
        {pos.reserve_used_minor > 0 && row('Pago pela reserva', 'custo já descontado quando o dinheiro foi alocado', m(pos.reserve_used_minor))}
        {pos.excess_minor > 0 && row('Acima do ganho · a rever', `${over.map((x) => x.display_name).join(', ')} · já saiu · por decidir`, m(-pos.excess_minor),
          () => navigate(to('/privado/fecho/profissionais', { pessoa: over[0]!.person_id })))}
      </ListGroup>

      <section className="stack">
        <span className="label">Decisão dos sócios</span>
        <ListGroup>
          {row('Distribuição aos sócios',
            pos.owners_decision ? `registada por ${pos.owners_decision.decided_by} · ${when(pos.owners_decision.decided_at, org.timezone)}` : 'por decidir',
            pos.owners_decision ? (pos.owners_decision.kind === 'none' ? 'Sem distribuição' : m(pos.distribution_minor ?? 0)) : '—',
            closed ? undefined : () => sheets.open('decide'))}
          {row('Não distribuído', 'livre − distribuição', pos.undistributed_minor === null ? '—' : m(pos.undistributed_minor))}
        </ListGroup>
        {(pos.undistributed_minor ?? 0) < 0 && <div className="notice notice-warning">A distribuição registada passa o valor livre em {m(-(pos.undistributed_minor ?? 0))}. Fica para rever.</div>}
      </section>

      <ListGroup>
        {row('A pagar à equipa', `= ganhos ${g(pos.team_earned_minor)} − entregue até ao ganho ${g(pos.delivered_to_earned_minor)}${over.length ? ` · ${over.map((x) => x.display_name).join(', ')} 0` : ''}`, m(pos.payable_minor))}
      </ListGroup>

      {sheets.current === 'explain' && <ExplainSheet f={f} onClose={sheets.close} />}
      {sheets.current === 'decide' && <OwnersDecisionSheet f={f} onDirty={sheets.setDirty} onClose={sheets.close} onDone={sheets.done} />}
      {sheets.discard}
    </AppScreen>
  )
}

function ExplainSheet({ f, onClose }: { f: Fecho; onClose: () => void }) {
  const org = useOrganization()
  const pos = f.position
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const defined = pos.people.filter((x) => x.earned_minor !== null)
  const over = pos.people.filter((x) => (x.excess_minor ?? 0) > 0)
  const total = pos.livre_minor ?? pos.sobra_minor
  const steps: [string, string][] = [
    ['Produção do período', `${pos.production.count} serviços registados = ${m(pos.production.total_minor)}`],
    ['Ganhos da equipa', `${defined.map((x) => `${x.display_name} ${g(x.earned_minor ?? 0)}`).join(' + ')} = ${m(pos.team_earned_minor)} · = entregue até ao ganho ${g(pos.delivered_to_earned_minor)} + a pagar ${g(pos.payable_minor)}${pos.pending.length ? ` · ainda sem ${pos.pending.map((x) => x.display_name).join(' e ')}` : ''}`],
    ['Despesas', `${pos.expenses.count} despesas = ${m(pos.expenses.total_minor)}`],
    ['Compras · parte do salão', `${g(pos.purchases.total_minor)} − contribuições ${g(pos.purchases.contributions_minor)} = ${m(pos.purchases.salon_minor)}`],
    ['Reserva alocada', `${m(pos.reserve_allocated_minor)} · dinheiro do salão, não distribuível`],
    ...(pos.reserve_used_minor ? [['Pago pela reserva', `+${m(pos.reserve_used_minor)} · o custo já reduziu o livre quando o dinheiro foi alocado`] as [string, string]] : []),
    ...(over.length ? [['Entregue acima do ganho · a rever', `${over.map((x) => `${x.display_name}: adiantamentos ${g(x.advances.total_minor)}${x.payments.count ? ` e pagamentos ${g(x.payments.total_minor)}` : ''}, ganho ${g(x.earned_minor ?? 0)} → ${m(x.excess_minor ?? 0)}`).join('; ')}. Já saiu do salão, por isso reduz o livre. Não é ganho, dívida nem crédito; o que fazer com este valor é decisão da gestão, ainda em aberto.`] as [string, string]] : []),
    [pos.livre_minor === null ? 'Sobra · antes das regras por definir' : 'Livre para decisão dos sócios',
      `${g(pos.production.total_minor)} − ${g(pos.team_earned_minor)} − ${g(pos.expenses.total_minor)} − ${g(pos.purchases.salon_minor)} − ${g(pos.reserve_allocated_minor)}${pos.reserve_used_minor ? ` + ${g(pos.reserve_used_minor)}` : ''}${pos.excess_minor ? ` − ${g(pos.excess_minor)}` : ''} = ${m(total)}`],
  ]
  return (
    <BottomSheet labelledBy="ex-title" onDismiss={onClose}>
      <div className="row-between">
        <h2 id="ex-title" className="sheet-title">{pos.livre_minor === null ? 'Porque ainda não há valor livre?' : `Como se chega a ${m(pos.livre_minor)}?`}</h2>
        <button className="icon-btn" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
      </div>
      <ol className="explain" data-testid="position-explanation">{steps.map(([h, b]) => <li key={h}><strong>{h}</strong><br /><span className="muted num">{b}</span></li>)}</ol>
      <p className="note support">Adiantamentos e pagamentos até ao ganho são formas de entregar os ganhos, não custos adicionais. É o valor deste período, não um saldo de caixa. Não é lucro contabilístico.</p>
    </BottomSheet>
  )
}

function OwnersDecisionSheet({ f, onDirty, onClose, onDone }: { f: Fecho; onDirty: (d: boolean) => void; onClose: () => void; onDone: () => void }) {
  const org = useOrganization()
  const pos = f.position
  const m = (n: number) => formatMoney(n, org)
  const initialKind = pos.owners_decision?.kind ?? 'amount'
  const initialDigits = pos.owners_decision?.amount_minor ? String(pos.owners_decision.amount_minor / 10 ** org.currency_exponent) : ''
  const [kind, setKind] = useState<'none' | 'amount'>(initialKind)
  const [digits, setDigits] = useState(initialDigits)
  const [step, setStep] = useState<1 | 2>(1)
  const amount = wholeUnitsToMinor(digits, org)
  const preview = useQuery({ queryKey: fechoKeys.distribution(f.period.id, kind, kind === 'amount' ? amount : null),
    queryFn: () => getDistributionPreview(f.period.id, kind, kind === 'amount' ? amount : null) })
  const dirty = step === 2 || kind !== initialKind || digits !== initialDigits
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  const over = pos.people.filter((x) => (x.excess_minor ?? 0) > 0)
  const ok = kind === 'none' || (amount !== null && amount > 0)
  const undistributed = preview.data?.undistributed_minor ?? null
  return (
    <BottomSheet labelledBy="od-title" onDismiss={onClose} dismissible={!dirty}>
      <div className="row-between">
        <h2 id="od-title" className="sheet-title">Decisão dos sócios · {f.period.label}</h2>
        <button className="icon-btn" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
      </div>
      {step === 1 ? (
        <>
          <KV rows={[['Livre para decisão', pos.livre_minor === null ? '—' : m(pos.livre_minor)]]} />
          <span className="support">
            {pos.livre_minor === null ? `Ainda há regras por definir (${pos.pending.map((x) => x.display_name).join(' e ')}): o efeito aparece quando todas estiverem definidas.`
              : `com todas as regras definidas${over.length ? ` · já desconta ${m(pos.excess_minor)} entregues a ${over.map((x) => x.display_name).join(', ')} acima do ganho, a rever` : ''}`}
          </span>
          {pos.owners_decision && <span className="support">Decisão registada por {pos.owners_decision.decided_by} · {when(pos.owners_decision.decided_at, org.timezone)}. Pode ser alterada até o período fechar; a alteração fica registada.</span>}
          <SegmentedControl label="Decisão" hideLabel value={kind} onChange={(k) => setKind(k as 'none' | 'amount')}
            options={[{ id: 'none', label: 'Sem distribuição' }, { id: 'amount', label: 'Distribuir um valor' }]} />
          {kind === 'amount' && <AmountField label="Valor a distribuir" value={digits} onChange={setDigits} symbol={org.currency_symbol} />}
          <KV rows={[['Não distribuído', undistributed === null ? '—' : m(undistributed)]]} />
          {(undistributed ?? 0) < 0 && <span className="notice notice-warning">Este valor passa o livre deste período. Pode registar; fica para rever.</span>}
          <span className="support">Não é remuneração por serviços, despesa, adiantamento nem reserva. Os sócios decidem; o produto mostra o efeito. Fica registado com quem decidiu e quando.</span>
          <button className="btn btn-primary btn-tall" disabled={!ok} onClick={() => setStep(2)}>Registar decisão</button>
        </>
      ) : (
        <>
          <button className="link-btn self-start" onClick={() => setStep(1)}><Icon name="back" size={18} />Voltar à decisão</button>
          <SheetBoundary permission="period.decide" run={recordOwnersDecision} input={{ periodId: f.period.id, kind, amountMinor: kind === 'amount' ? amount : null }}
            intro="A decisão dos sócios tem de ser confirmada por uma pessoa autorizada." label="Confirmar decisão" onSuccess={onDone} onBack={() => setStep(1)}
            lockNote="Fica no histórico com quem decidiu e quando. Pode ser alterada até o período fechar, com registo da alteração.">
            <KV rows={[['Decisão', kind === 'none' ? 'Sem distribuição' : `Distribuir ${m(amount ?? 0)}`], ['Não distribuído', undistributed === null ? '—' : m(undistributed)]]} />
          </SheetBoundary>
        </>
      )}
    </BottomSheet>
  )
}
