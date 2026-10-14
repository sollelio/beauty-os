// Profissionais (Slice 06 F3) with the review sheet (F4 determinate · F4b advances above earned). A pending person
// shows "—", never 0. "Ver situação completa" hands off to Slice 04. Exceptions first: Decidir, then A rever, then
// Pronto (quieter, still listed); each whole row opens the person; the sheet is a history entry (back closes it).
import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useOrganization } from '../../modules/org/OrganizationContext'
import type { PersonFigures } from '../../modules/period/api'
import { formatAmount, formatMoney } from '../../shared/money'
import { formatDayShort } from '../../shared/time'
import { AppScreen, BottomActionBar } from '../../shared/ui/AppShell'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack, useSheet } from '../../shared/ui/navigation'
import { PrivateBar } from '../privado/PrivateBar'
import { stateLine, useFecho } from './fecho'
import { KV, Loading, Pill } from './ui'

const pct = (n: number | null) => `${String(Number(n)).replace('.', ',')}%`
const rank = (x: PersonFigures) => (x.earned_minor === null ? 0 : (x.excess_minor ?? 0) > 0 ? 1 : 2)

export function ProfessionalsPage() {
  const org = useOrganization()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const { q, to } = useFecho()
  const back = useAppBack(to('/privado/fecho'))
  const sheets = useSheet<string>()
  // Opened for one person (from "Acima do ganho"): that person's sheet, as its own entry so back closes it.
  const asked = useRef(false)
  const pessoa = sp.get('pessoa')
  useEffect(() => {
    if (asked.current || !pessoa || !q.data) return
    asked.current = true
    sheets.open(pessoa)
  }, [pessoa, q.data, sheets])
  if (!q.data) return <Loading q={q} title="Profissionais" />
  const f = q.data
  const g = (n: number) => formatAmount(n, org)
  const people = [...f.position.people].sort((a, b) => rank(a) - rank(b))
  const pending = people.filter((x) => x.earned_minor === null)
  const person = people.find((x) => x.person_id === sheets.current)

  const derivation = (x: PersonFigures) => {
    if (x.earned_minor === null) {
      return `Regra por definir · ${x.production.count} serviços ${g(x.production.total_minor)} · ${x.advances.count ? `adiant. ${g(x.advances.total_minor)}` : 'sem adiantamentos'}${x.is_owner ? ' · sócio' : ''}`
    }
    const base = `${pct(x.rule.percent)} · ganho ${g(x.earned_minor)} − adiant. ${g(x.advances.total_minor)}${x.payments.count ? ` − pagos ${g(x.payments.total_minor)}` : ''}`
    if ((x.excess_minor ?? 0) > 0) return `${base} = ${g(x.difference_minor ?? 0)} · nada a pagar`
    return `${base}${x.contributions.count ? ` · contribuição ${g(x.contributions.total_minor)} à parte` : ''}`
  }

  return (
    <AppScreen
      bar={<PrivateBar title="Profissionais" onBack={back} />}
      actions={f.period.state === 'aberto' && (
        <BottomActionBar>
          <span className="row-between num"><span className="muted">A pagar · definido</span><strong>{formatMoney(f.position.payable_minor, org)}</strong></span>
          <button className="btn btn-primary btn-tall" disabled={!f.readiness.can_approve} onClick={() => navigate(to('/privado/fecho/aprovar'))}>Aprovar valores a pagar</button>
          {pending.length > 0 && <span className="bar-summary support">Defina as regras de {pending.map((x) => x.display_name).join(' e ')} para aprovar.</span>}
        </BottomActionBar>
      )}>
      <section className="stack stack-tight">
        <h1>{stateLine(f)}</h1>
        <span className="support">Toque num nome para rever os valores.</span>
      </section>
      <ListGroup>
        {people.map((x) => {
          const pill = x.earned_minor === null ? <Pill kind="block">Decidir</Pill> : (x.excess_minor ?? 0) > 0 ? <Pill kind="review">A rever</Pill> : <Pill kind="ok">Pronto</Pill>
          return (
            <ListRow key={x.person_id} as="button"
              onClick={() => (x.earned_minor === null && f.period.state === 'aberto' ? navigate(to(`/privado/fecho/regra/${x.person_id}`)) : sheets.open(x.person_id))}
              leading={<span className="avatar row-avatar" aria-hidden>{x.display_name.slice(0, 1)}</span>}
              title={<span className="title-line">{x.display_name}{pill}</span>} subtitle={<span className="num">{derivation(x)}</span>}
              trailing={<span className={`num amount-cell${x.earned_minor === null ? ' tone-warning' : (x.remaining_minor ?? 0) === 0 ? ' tone-muted' : ''}`}>
                {x.earned_minor === null ? '—' : formatMoney(x.remaining_minor ?? 0, org)}</span>} />
          )
        })}
      </ListGroup>
      <p className="note support">Cada valor é a soma dos registos do período. Um valor «—» não é zero: ainda não existe até a regra ser definida.</p>
      {person && <ReviewSheet x={person} f={f.period.state} periodLabel={f.period.label} onClose={sheets.close}
        onChangeRule={() => sheets.leaveTo(to(`/privado/fecho/regra/${person.person_id}`))} onFull={() => sheets.leaveTo(`/privado/situacao/${person.person_id}?p=${f.period.id}`)} />}
    </AppScreen>
  )
}

function ReviewSheet({ x, f, periodLabel, onClose, onChangeRule, onFull }: { x: PersonFigures; f: string; periodLabel: string; onClose: () => void; onChangeRule: () => void; onFull: () => void }) {
  const org = useOrganization()
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const excess = (x.excess_minor ?? 0) > 0
  return (
    <BottomSheet labelledBy="rv-title" onDismiss={onClose}>
      <div className="row-between">
        <h2 id="rv-title" className="sheet-title">{x.display_name} · {periodLabel}</h2>
        <button className="icon-btn" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
      </div>
      {excess && (
        <div className="notice notice-warning" role="status">Ganhou menos do que recebeu em adiantamentos: {m(x.excess_minor ?? 0)} entregues acima do ganho. Nada a pagar neste período. Esse valor já saiu do salão e não fica registado como ganho, dívida nem crédito; o que fazer com ele é decisão da gestão, ainda em aberto.</div>
      )}
      <KV rows={[
        ['Produção', `${x.production.count} serviços · ${m(x.production.total_minor)}`],
        ['Regra deste período', x.rule.percent === null ? 'Ainda não definida' : `${pct(x.rule.percent)} para ${x.display_name} · ${pct(x.rule.salon_percent)} salão${x.rule.set_by ? ` · ${x.rule.set_by}` : ''}${x.rule.set_at ? ` · ${formatDayShort(x.rule.set_at, org.timezone)}` : ''}`],
        ['Ganho', x.earned_minor === null ? '—' : m(x.earned_minor)],
        [`Adiantamentos · ${x.advances.count}`, x.advances.count ? m(-x.advances.total_minor) : '—'],
        ['Pagamentos', x.payments.count ? m(-x.payments.total_minor) : '—'],
      ]} />
      <div className="money-headline">
        <span className="label">Falta receber</span>
        <span className="amount" data-testid="review-remaining">{x.remaining_minor === null ? '—' : m(x.remaining_minor)}</span>
        {excess && <span className="support num">{g(x.earned_minor ?? 0)} − {g(x.advances.total_minor)}{x.payments.count ? ` − ${g(x.payments.total_minor)}` : ''} = {g(x.difference_minor ?? 0)} → mostra 0</span>}
      </div>
      {x.contributions.count > 0 && <p className="note support num">À parte: contribuições em compras {m(x.contributions.total_minor)} ({x.contributions.count} {x.contributions.count === 1 ? 'compra' : 'compras'}). Não é descontado nem somado ao valor a receber.</p>}
      <div className="sheet-actions">
        {x.rule.kind === 'contextual' && x.rule.decided && f === 'aberto' && <button className="btn btn-secondary" onClick={onChangeRule}>Alterar regra do período</button>}
        <button className="btn btn-secondary" onClick={onFull}>Ver situação completa</button>
      </div>
    </BottomSheet>
  )
}
