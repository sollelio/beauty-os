// Fecho home (Slice 06 F1/F2/F10b/F12/F14): state strip, one readiness notice, exceptions only, a three-row summary
// and one clear next action. Every figure comes from the database review (fecho_period).
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { annulApproval, fechoKeys, listFechoPeriods, STATE_LABEL, type Fecho, type FechoException } from '../../modules/period/api'
import { formatAmount, formatMoney } from '../../shared/money'
import { formatTime, formatDayShort } from '../../shared/time'
import { rangeLabel, useFecho, when } from './fecho'
import { Boundary, ExceptionRow, KV, Loading, StateStrip, SummaryRow } from './ui'

export function FechoHome() {
  const org = useOrganization()
  const navigate = useNavigate()
  const [, setSp] = useSearchParams()
  const { q, to } = useFecho()
  const [sheet, setSheet] = useState<null | 'period' | 'annul'>(null)
  if (!q.data) return <Loading q={q} />
  const f = q.data
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const pos = f.position
  const st = f.period.state
  const pending = pos.pending
  const lines = f.approval?.lines.filter((l) => l.approved_minor > 0) ?? []
  const paidCount = lines.filter((l) => l.status === 'pago').length
  const outstanding = lines.filter((l) => l.outstanding_minor > 0)
  const cases = f.exceptions.filter((e) => e.kind === 'above_earned').length

  const exceptionRow = (e: FechoException, i: number) => {
    switch (e.kind) {
      case 'rule_pending': return <ExceptionRow key={i} dot="amber" title="Regra por definir" pill="Decidir" pillKind="block"
        sub={`${e.person.display_name} · ${g(e.person.production.total_minor)} · ${e.person.production.count} serviços${e.person.is_owner ? ' · sócio' : ''}`}
        onOpen={() => navigate(to(`/privado/fecho/regra/${e.person.person_id}`))} />
      case 'above_earned': return <ExceptionRow key={i} dot="neutral" title="Acima do ganho" pill="A rever" pillKind="review"
        sub={`${e.person.display_name} · ganho ${g(e.person.earned_minor ?? 0)} · adiant. ${g(e.person.advances.total_minor)}`}
        onOpen={() => navigate(to('/privado/fecho/profissionais', { pessoa: e.person.person_id }))} />
      case 'distribution_undecided': return <ExceptionRow key={i} dot="neutral" title="Distribuição por decidir" pill="Por decidir" pillKind="review"
        sub={`livre ${pos.livre_minor === null ? '—' : g(pos.livre_minor)} · decisão dos sócios ainda não registada`} onOpen={() => navigate(to('/privado/fecho/posicao'))} />
      case 'distribution_above_free': return <ExceptionRow key={i} dot="neutral" title="Distribuição acima do livre" pill="Por rever" pillKind="review"
        sub={`distribuição ${g(pos.distribution_minor ?? 0)} · livre ${g(pos.livre_minor ?? 0)}`} onOpen={() => navigate(to('/privado/fecho/posicao'))} />
      case 'payment_pending': return <ExceptionRow key={i} dot="neutral" title="Pagamento por confirmar" pill="Por pagar" pillKind="neutral"
        sub={`${e.line.display_name} · ${m(e.line.outstanding_minor)}${e.line.status === 'parcial' ? ' · parcial' : ''}`} onOpen={() => navigate(to('/privado/fecho/pagamentos'))} />
    }
  }

  const readiness = (() => {
    if (st === 'fechado' && f.closed) {
      return <div className="lock-card" role="status"><strong>Fechado em {formatDayShort(f.closed.closed_at, org.timezone)} às {formatTime(f.closed.closed_at, org.timezone)} por {f.closed.closed_by}</strong>
        <span>Só de leitura; reabrir exige autorização e motivo.</span></div>
    }
    if (st === 'aberto' && pending.length > 0) {
      return <div className="notice notice-warning" role="status"><strong style={{ display: 'block' }}>Ainda não pode aprovar</strong>
        {pending.length} {pending.length === 1 ? 'regra' : 'regras'} por definir. Depois pode aprovar e passar a pagamento.</div>
    }
    if (st === 'aberto') {
      const undecided = pos.owners_decision === null
      return <div className="notice notice-success" role="status"><strong style={{ display: 'block' }}>Pronto para aprovar</strong>
        Nada bloqueia.{cases > 0 ? ` ${cases} ${cases === 1 ? 'caso a rever fica registado' : 'casos a rever ficam registados'} na aprovação;` : ''} {undecided ? 'distribuição ainda por decidir.' : 'distribuição já decidida.'}</div>
    }
    if (st === 'pronto_para_pagamento' && f.approval) {
      return <div className="notice notice-neutral" role="status"><strong style={{ display: 'block' }}>Valores aprovados · {m(f.approval.total_minor)}</strong>
        {f.approval.approved_by} · {when(f.approval.approved_at, org.timezone)} · {outstanding.length} por confirmar</div>
    }
    return <div className="notice notice-neutral" role="status"><strong style={{ display: 'block' }}>{paidCount} de {lines.length} pagamentos confirmados</strong>
      {outstanding.length > 0
        ? `Falta ${m(f.readiness.unpaid_minor)} · ${outstanding.map((l) => l.display_name).join(', ')}. Só pode fechar com tudo confirmado.`
        : 'Todos os pagamentos aprovados estão confirmados. Pode fechar o período.'}</div>
  })()

  const professionalsSub = f.approval
    ? `aprovado ${g(f.approval.total_minor)} · pago ${g(f.approval.paid_minor)} · por pagar ${g(f.approval.outstanding_minor)}`
    : `a pagar ${g(pos.payable_minor)}${pending.length ? ` definido · ${pending.length} por determinar` : cases ? ` · ${cases} ${cases === 1 ? 'caso' : 'casos'} a rever` : ''}`
  const positionSub = pos.livre_minor === null
    ? `livre para os sócios — · ${pending.length} ${pending.length === 1 ? 'regra' : 'regras'} por definir`
    : pos.distribution_minor === null ? `livre ${g(pos.livre_minor)} · distribuição por decidir`
      : `livre ${g(pos.livre_minor)} · distribuição ${g(pos.distribution_minor)} · não distribuído ${g(pos.undistributed_minor ?? 0)}`

  const footer = (() => {
    if (st === 'aberto') {
      const first = f.exceptions.find((e) => e.kind === 'rule_pending')
      return first && first.kind === 'rule_pending'
        ? <button className="btn btn-primary btn-tall" onClick={() => navigate(to(`/privado/fecho/regra/${first.person.person_id}`))}>Decidir regra · {first.person.display_name}</button>
        : <button className="btn btn-primary btn-tall" onClick={() => navigate(to('/privado/fecho/aprovar'))}>Aprovar valores a pagar</button>
    }
    if (st === 'fechado') return null
    return (
      <>
        {outstanding.length > 0
          ? <button className="btn btn-primary btn-tall" onClick={() => navigate(to('/privado/fecho/pagamentos'))}>Confirmar pagamentos{st === 'em_pagamento' ? ` · ${outstanding.length}` : ''}</button>
          : <button className="btn btn-primary btn-tall" onClick={() => navigate(to('/privado/fecho/fechar'))}>Fechar período</button>}
        {st === 'em_pagamento' && outstanding.length > 0 && (
          <>
            <button className="btn btn-secondary" onClick={() => navigate(to('/privado/fecho/fechar'))}>Fechar período</button>
            <span className="muted" style={{ textAlign: 'center', fontSize: '0.8125rem' }}>Só fecha depois de todos os pagamentos confirmados.</span>
          </>
        )}
        {f.readiness.can_annul && <button className="link-btn" onClick={() => setSheet('annul')}>Voltar a rever (anula a aprovação)</button>}
      </>
    )
  })()

  return (
    <main className="app-main">
      <header className="stack" style={{ gap: '0.625rem' }}>
        <div className="flow-header-row">
          <button className="icon-btn" aria-label="Voltar a Hoje" onClick={() => navigate('/')}>⌂</button>
          <span className="muted" style={{ fontWeight: 600 }}>Fecho</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <button className="icon-btn" aria-label="Decisões e histórico do fecho" onClick={() => navigate(to('/privado/fecho/historico'))}>🕒</button>
            <span className="priv">Privado</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <span><h1 style={{ fontSize: '1.5rem' }}>{f.period.label}</h1>
            <span className="muted" style={{ fontSize: '0.875rem' }}>{rangeLabel(f.period.starts_on, f.period.ends_on, org.timezone)} · {f.period.is_current ? 'período actual' : 'outro período'}</span></span>
          <button className="chip chip-outline" onClick={() => setSheet('period')}>Período ▾</button>
        </div>
        <StateStrip state={st} />
      </header>

      {readiness}

      {f.exceptions.length > 0 && (
        <section className="stack" style={{ gap: 0 }} aria-label="Precisa de atenção">
          <span className="label">Precisa de atenção</span>
          {f.exceptions.map(exceptionRow)}
        </section>
      )}

      {st === 'fechado' ? (
        <section className="stack">
          <KV rows={[
            ['Produção', m(pos.production.total_minor)],
            ['Ganhos da equipa', m(-pos.team_earned_minor)],
            ['Despesas', m(-pos.expenses.total_minor)],
            ['Compras · parte do salão', m(-pos.purchases.salon_minor)],
            ['Reserva alocada', m(-pos.reserve_allocated_minor)],
            ...(pos.reserve_used_minor ? [['Pago pela reserva', m(pos.reserve_used_minor)] as [string, string]] : []),
            ...(pos.excess_minor ? [[`Acima do ganho · ${pos.people.filter((x) => (x.excess_minor ?? 0) > 0).map((x) => x.display_name).join(', ')} · a rever`, m(-pos.excess_minor)] as [string, string]] : []),
            ...(pos.owners_decision ? [['Distribuição aos sócios', m(-(pos.distribution_minor ?? 0))] as [string, string]] : [['Decisão dos sócios', 'Sem decisão registada ao fechar'] as [string, string]]),
            ['Não distribuído', pos.undistributed_minor === null ? '—' : m(pos.undistributed_minor)],
          ]} />
          <SummaryRow title="Profissionais" sub={professionalsSub} onOpen={() => navigate(to('/privado/fecho/profissionais'))} />
          <SummaryRow title="Posição do período" sub={positionSub} onOpen={() => navigate(to('/privado/fecho/posicao'))} />
        </section>
      ) : (
        <section className="stack" style={{ gap: 0 }}>
          <span className="label">Resumo do período</span>
          <SummaryRow title="Profissionais" sub={professionalsSub} onOpen={() => navigate(to('/privado/fecho/profissionais'))} />
          <SummaryRow title="Despesas, compras e reserva"
            sub={`despesas ${g(pos.expenses.total_minor)} · compras ${g(pos.purchases.salon_minor)} · reserva ${g(pos.reserve_allocated_minor)}`}
            onOpen={() => navigate(to('/privado/fecho/dinheiro'))} />
          <SummaryRow title="Posição do período" sub={positionSub} onOpen={() => navigate(to('/privado/fecho/posicao'))} />
        </section>
      )}

      {footer && <div className="footer">{footer}</div>}

      {sheet === 'period' && <PeriodSheet current={f} onPick={(id) => { setSp({ p: id }); setSheet(null) }} onClose={() => setSheet(null)} />}
      {sheet === 'annul' && (
        <div className="sheet" role="dialog" aria-label="Voltar a rever" onClick={() => setSheet(null)}>
          <div className="sheet-body" style={{ maxHeight: '92dvh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <Boundary permission="period.decide" run={annulApproval} input={{ periodId: f.period.id, revision: f.review_revision }}
              intro="Anular a aprovação devolve o período a «Aberto». Os valores voltam a poder mudar; a aprovação anulada fica no histórico."
              lockNote="Fica no histórico com quem anulou e quando. Só é possível enquanto não houver pagamentos confirmados."
              label="Anular aprovação" onSuccess={() => setSheet(null)} onBack={() => setSheet(null)} />
          </div>
        </div>
      )}
    </main>
  )
}

function PeriodSheet({ current, onPick, onClose }: { current: Fecho; onPick: (id: string) => void; onClose: () => void }) {
  const periods = useQuery({ queryKey: fechoKeys.periods, queryFn: listFechoPeriods })
  return (
    <div className="sheet" role="dialog" aria-labelledby="pe-title" onClick={onClose}>
      <div className="sheet-body" style={{ maxHeight: '80dvh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="flow-header-row"><h2 id="pe-title" style={{ fontSize: '1.25rem' }}>Período</h2><button className="icon-btn" aria-label="Fechar" onClick={onClose}>×</button></div>
        {periods.data?.map((p) => (
          <button key={p.id} className="pick" aria-current={p.id === current.period.id} onClick={() => onPick(p.id)}
            style={p.id === current.period.id ? { borderColor: 'var(--accent)', borderWidth: '1.5px' } : undefined}>
            <span><strong style={{ display: 'block' }}>{p.label}</strong><span className="muted" style={{ fontSize: '0.875rem' }}>{STATE_LABEL[p.state].toLocaleLowerCase('pt-PT')}</span></span>
            {p.id === current.period.id && <span aria-hidden style={{ color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
