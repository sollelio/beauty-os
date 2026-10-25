// Fecho home (Slice 06 F1/F2/F10b/F12/F14): the period and its state, one readiness notice, exceptions first, a
// three-row summary and the one next valid action in the bottom bar. Every figure comes from the database review
// (fecho_period). On the mobile shell: the private bar (← back inside the private area, never to Hoje), sheets as history
// entries, and a closed period that reads as read-only — Reabrir sits apart at the end, never as the bar's action.
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { annulApproval, fechoKeys, listFechoPeriods, STATE_LABEL, type Fecho, type FechoException, type PeriodState } from '../../modules/period/api'
import { formatAmount, formatMoney } from '../../shared/money'
import { formatTime, formatDayShort } from '../../shared/time'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { AppScreen, BottomActionBar, LockIcon } from '../../shared/ui/AppShell'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack, useSheet } from '../../shared/ui/navigation'
import { StatusChip } from '../../shared/ui/StatusChip'
import { ErrorState, Skeleton } from '../../shared/ui/states'
import { PrivateBar } from '../privado/PrivateBar'
import { rangeLabel, useFecho, when } from './fecho'
import { ExceptionRow, KV, Loading, SheetBoundary, StateStrip, SummaryRow } from './ui'
import { DeclareWeekEndSheet, WeekEndNotice, WithdrawWeekEndSheet } from './WeekEnd'

const STATE_TONE: Record<PeriodState, 'warning' | 'accent' | 'neutral' | 'success'> = {
  aberto: 'neutral', pronto_para_pagamento: 'accent', em_pagamento: 'accent', fechado: 'success',
}

export function FechoHome() {
  const org = useOrganization()
  const navigate = useNavigate()
  const back = useAppBack('/privado')
  const { q, to } = useFecho()
  const sheets = useSheet<'period' | 'annul' | 'week-end' | 'week-continue'>()
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
  // the operational week (Slice 2): only with the organization's schedule; otherwise everything is as before
  const we = st === 'aberto' && f.week_end?.available ? f.week_end : null
  const weekOpen = !!we && !we.ended

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
      return <div className="readonly-note" role="status"><LockIcon /><span className="stack stack-tight">
        <strong>Fechado em {formatDayShort(f.closed.closed_at, org.timezone)} às {formatTime(f.closed.closed_at, org.timezone)} por {f.closed.closed_by}</strong>
        <span>Só de leitura; reabrir exige autorização e motivo.</span></span></div>
    }
    if (f.reopened) {
      return <div className="notice notice-success" role="status"><strong style={{ display: 'block' }}>{outstanding.length ? `${paidCount} de ${lines.length} pagamentos confirmados` : 'Todos os pagamentos confirmados'}</strong>
        Reaberto por {f.reopened.by} · {when(f.reopened.at, org.timezone)} · motivo: {f.reopened.reason}.</div>
    }
    if (st === 'aberto' && pending.length > 0) {
      return <div className="notice notice-warning" role="status"><strong style={{ display: 'block' }}>Ainda não pode aprovar</strong>
        {pending.length} {pending.length === 1 ? 'regra' : 'regras'} por definir. Depois pode aprovar e passar a pagamento.</div>
    }
    if (weekOpen) return null                                                  // the week notice says what comes first
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

  // The one next valid action (and its companions) for every state but closed.
  const actions = (() => {
    if (st === 'fechado') return null
    if (st === 'aberto') {
      const first = f.exceptions.find((e) => e.kind === 'rule_pending')
      if (first && first.kind === 'rule_pending') {
        return <button className="btn btn-primary btn-tall" onClick={() => navigate(to(`/privado/fecho/regra/${first.person.person_id}`))}>Decidir regra · {first.person.display_name}</button>
      }
      return we?.can_declare ? (
        <>
          <button className="btn btn-primary btn-tall" onClick={() => sheets.open('week-end')}>Terminar a semana</button>
          <button className="btn btn-secondary" onClick={() => navigate(to('/privado/fecho/aprovar'))}>Aprovar valores a pagar</button>
        </>
      ) : <button className="btn btn-primary btn-tall" onClick={() => navigate(to('/privado/fecho/aprovar'))}>Aprovar valores a pagar</button>
    }
    return (
      <>
        {outstanding.length > 0
          ? <button className="btn btn-primary btn-tall" onClick={() => navigate(to('/privado/fecho/pagamentos'))}>Confirmar pagamentos{st === 'em_pagamento' ? ` · ${outstanding.length}` : ''}</button>
          : <button className="btn btn-primary btn-tall" onClick={() => navigate(to('/privado/fecho/fechar'))}>Fechar período</button>}
        {st === 'em_pagamento' && outstanding.length > 0 && (
          <>
            <button className="btn btn-secondary" onClick={() => navigate(to('/privado/fecho/fechar'))}>Fechar período</button>
            <span className="bar-summary support">Só fecha depois de todos os pagamentos confirmados.</span>
          </>
        )}
        {st === 'em_pagamento' && outstanding.length === 0 && <button className="btn btn-secondary" onClick={() => navigate(to('/privado/fecho/pagamentos'))}>Ver pagamentos</button>}
      </>
    )
  })()

  return (
    <AppScreen
      bar={<PrivateBar title="Fecho" onBack={back} actions={
        <button className="app-bar-btn" aria-label="Decisões e histórico do fecho" onClick={() => navigate(to('/privado/fecho/historico'))}><Icon name="clock" size={22} /></button>
      } />}
      actions={actions && <BottomActionBar>{actions}</BottomActionBar>}>
      <section className="stack" aria-label="Período">
        <div className="row-between">
          <span className="stack stack-tight">
            <h1>{f.period.label}</h1>
            <span className="support">{rangeLabel(f.period.starts_on, f.period.ends_on, org.timezone)} · {f.period.is_current ? 'período actual' : 'outro período'}</span>
          </span>
          <button className="chip chip-outline" aria-label={`Mudar de período · ${f.period.label}`} onClick={() => sheets.open('period')}>Período<Icon name="chevronDown" size={18} /></button>
        </div>
        <StateStrip state={st} />
      </section>

      {we && <WeekEndNotice we={we} timeZone={org.timezone} />}
      {readiness}

      {f.exceptions.length > 0 && (
        <section className="stack" aria-label="Precisa de atenção">
          <span className="label">Precisa de atenção</span>
          <ListGroup>{f.exceptions.map(exceptionRow)}</ListGroup>
        </section>
      )}

      {st === 'fechado' ? (
        <>
          <section className="stack">
            <span className="label">Valores fechados</span>
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
          </section>
          <ListGroup>
            <SummaryRow title="Profissionais" sub={professionalsSub} onOpen={() => navigate(to('/privado/fecho/profissionais'))} />
            <SummaryRow title="Posição do período" sub={positionSub} onOpen={() => navigate(to('/privado/fecho/posicao'))} />
            <SummaryRow title="Decisões e histórico" sub="quem decidiu, aprovou, pagou e fechou" onOpen={() => navigate(to('/privado/fecho/historico'))} />
          </ListGroup>
          <section className="exceptional">
            <button className="btn btn-destructive" onClick={() => navigate(to('/privado/fecho/reabrir'))}>Reabrir período (autorização necessária)</button>
            <span className="support">Só em caso de erro. Exige motivo e fica no histórico.</span>
          </section>
        </>
      ) : (
        <section className="stack">
          <span className="label">Resumo do período</span>
          <ListGroup>
            <SummaryRow title="Profissionais" sub={professionalsSub} onOpen={() => navigate(to('/privado/fecho/profissionais'))} />
            <SummaryRow title="Despesas, compras e reserva"
              sub={`despesas ${g(pos.expenses.total_minor)} · compras ${g(pos.purchases.salon_minor)} · reserva ${g(pos.reserve_allocated_minor)}`}
              onOpen={() => navigate(to('/privado/fecho/dinheiro'))} />
            <SummaryRow title="Posição do período" sub={positionSub} onOpen={() => navigate(to('/privado/fecho/posicao'))} />
          </ListGroup>
        </section>
      )}

      {we?.can_withdraw && (
        <section className="exceptional">
          <button className="btn btn-secondary" onClick={() => sheets.open('week-continue')}>Continuar a semana</button>
          <span className="support">Se ainda houver atividade nesta semana. Fica no histórico.</span>
        </section>
      )}

      {f.readiness.can_annul && (
        <section className="exceptional">
          <button className="btn btn-destructive" onClick={() => sheets.open('annul')}>Voltar a rever (anula a aprovação)</button>
          <span className="support">Só enquanto não houver pagamentos confirmados.</span>
        </section>
      )}

      {sheets.current === 'period' && <PeriodSheet current={f} onPick={(id) => sheets.leaveTo(`/privado/fecho?p=${encodeURIComponent(id)}`)} onClose={sheets.close} />}
      {sheets.current === 'week-end' && (
        <BottomSheet labelledBy="week-end-title" onDismiss={sheets.close}>
          <div className="row-between">
            <span id="week-end-title" className="label">Terminar a semana · {f.period.label}</span>
            <button className="icon-btn" aria-label="Fechar" onClick={sheets.close}><Icon name="close" /></button>
          </div>
          <DeclareWeekEndSheet f={f} timeZone={org.timezone} onDone={sheets.close} onClose={sheets.close} />
        </BottomSheet>
      )}
      {sheets.current === 'week-continue' && (
        <BottomSheet labelledBy="week-continue-title" onDismiss={sheets.close}>
          <div className="row-between">
            <span id="week-continue-title" className="label">Continuar a semana · {f.period.label}</span>
            <button className="icon-btn" aria-label="Fechar" onClick={sheets.close}><Icon name="close" /></button>
          </div>
          <WithdrawWeekEndSheet f={f} onDone={sheets.close} onClose={sheets.close} />
        </BottomSheet>
      )}
      {sheets.current === 'annul' && (
        <BottomSheet labelledBy="annul-title" onDismiss={sheets.close}>
          <div className="row-between">
            <span id="annul-title" className="label">Voltar a rever · {f.period.label}</span>
            <button className="icon-btn" aria-label="Fechar" onClick={sheets.close}><Icon name="close" /></button>
          </div>
          <SheetBoundary permission="period.decide" run={annulApproval} input={{ periodId: f.period.id, revision: f.review_revision }}
            intro="Anular a aprovação devolve o período a «Aberto». Os valores voltam a poder mudar; a aprovação anulada fica no histórico."
            lockNote="Fica no histórico com quem anulou e quando. Só é possível enquanto não houver pagamentos confirmados."
            label="Anular aprovação" onSuccess={sheets.close} onBack={sheets.close} destructive />
        </BottomSheet>
      )}
    </AppScreen>
  )
}

function PeriodSheet({ current, onPick, onClose }: { current: Fecho; onPick: (id: string) => void; onClose: () => void }) {
  const periods = useQuery({ queryKey: fechoKeys.periods, queryFn: listFechoPeriods })
  return (
    <BottomSheet labelledBy="pe-title" onDismiss={onClose}>
      <div className="row-between">
        <h2 id="pe-title" className="sheet-title">Período</h2>
        <button className="icon-btn" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
      </div>
      {periods.isPending && <Skeleton rows={3} />}
      {periods.isError && <ErrorState onRetry={() => periods.refetch()}>Não foi possível carregar os períodos.</ErrorState>}
      {periods.data && (
        <ListGroup>
          {periods.data.map((p) => (
            <ListRow key={p.id} as="button" current={p.id === current.period.id} onClick={() => onPick(p.id)} title={p.label}
              trailing={<>
                <StatusChip tone={STATE_TONE[p.state]}>{STATE_LABEL[p.state]}</StatusChip>
                {p.id === current.period.id && <span className="row-accent row-chevron"><Icon name="check" /></span>}
              </>} />
          ))}
        </ListGroup>
      )}
    </BottomSheet>
  )
}
