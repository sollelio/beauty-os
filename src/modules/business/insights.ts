// Business Health core insights (Slice 01): deterministic, generated on demand from the business_health read model.
// Nothing here computes a financial figure: it compares figures the database already produced against the V1
// thresholds, picks, groups and orders the insights, and says how each was reached. Wording states what changed
// together, never why (correlation, not causality).
import type { BusinessHealth, BusinessTeam, ComparisonReason } from './types'
import { INSIGHT_THRESHOLDS, type InsightThresholds } from './thresholds'

export type Severity = 'ACTION_REQUIRED' | 'ATTENTION' | 'INFORMATION'
export type InsightKind = 'payments_pending' | 'period_blocked' | 'production_up_result_down' | 'production_decline' | 'expense_category_high'
  | 'team_concentration'
export type Driver = { label: string; delta_minor: number; text: string }
export type Insight = {
  id: string
  kind: InsightKind
  severity: Severity
  periods: { id: string; label: string }[]
  title: string
  detail: {
    current?: string; reference?: string; change?: string
    basis: string                                   // periods used / what the comparison is against
    drivers: Driver[]
    action?: { label: string; to: string; finance: boolean }   // finance: only offered to team-finance holders
    confidence: string
  }
}
export type SkippedInsight = { kind: InsightKind; reason: ComparisonReason | 'not_enough_services' | 'figure_hidden' | 'not_enough_professionals' }

const SEVERITY_ORDER: Severity[] = ['ACTION_REQUIRED', 'ATTENTION', 'INFORMATION']
const KIND_ORDER: InsightKind[] = ['payments_pending', 'period_blocked', 'production_up_result_down', 'production_decline', 'expense_category_high', 'team_concentration']
const pct = (n: number) => `${Math.round(Math.abs(n))}%`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function buildInsights(h: BusinessHealth, money: (minor: number) => string, t: InsightThresholds = INSIGHT_THRESHOLDS, team?: BusinessTeam):
  { insights: Insight[]; skipped: SkippedInsight[] } {
  const out: Insight[] = []
  const skipped: SkippedInsight[] = []
  const cur = h.current
  const prevMeta = h.meta.comparison.previous
  const prevLabel = prevMeta.period?.label ?? 'o período anterior'

  // 1 · Approved amounts still unpaid (this and earlier open periods), one grouped insight
  const unpaid = h.open_periods.filter((p) => (p.unpaid_team_minor ?? 0) > 0)
  if (unpaid.length > 0) {
    const total = unpaid.reduce((s, p) => s + (p.unpaid_team_minor ?? 0), 0)
    out.push({
      id: `payments_pending:${unpaid.map((p) => p.id).join(',')}`, kind: 'payments_pending', severity: 'ACTION_REQUIRED',
      periods: unpaid.map((p) => ({ id: p.id, label: p.label })),
      title: `Ainda faltam ${money(total)} por pagar à equipa.`,
      detail: {
        current: money(total),
        basis: `Valores aprovados e ainda não pagos: ${unpaid.map((p) => `${p.label} ${money(p.unpaid_team_minor ?? 0)}`).join(' · ')}.`,
        drivers: [],
        action: { label: 'Ver pagamentos', to: `/privado/fecho/pagamentos?p=${unpaid[0]!.id}`, finance: true },
        confidence: 'Valor do fecho aprovado; desaparece quando os pagamentos forem confirmados.',
      },
    })
  }

  // 2 · Ended periods whose approval is blocked by rules still to decide, one grouped insight
  const blocked = h.open_periods.filter((p) => p.is_complete && p.state === 'aberto' && p.pending_rules_count > 0)
  if (blocked.length > 0) {
    const rules = blocked.reduce((s, p) => s + p.pending_rules_count, 0)
    out.push({
      id: `period_blocked:${blocked.map((p) => p.id).join(',')}`, kind: 'period_blocked', severity: 'ACTION_REQUIRED',
      periods: blocked.map((p) => ({ id: p.id, label: p.label })),
      title: blocked.length === 1
        ? `${blocked[0]!.label} terminou e não pode ser aprovado: ${plural(rules, 'regra de remuneração por definir', 'regras de remuneração por definir')}.`
        : `${blocked.length} períodos terminados não podem ser aprovados: ${plural(rules, 'regra de remuneração por definir', 'regras de remuneração por definir')}.`,
      detail: {
        basis: blocked.map((p) => `${p.label}: ${plural(p.pending_rules_count, 'regra por definir', 'regras por definir')}`).join(' · '),
        drivers: [],
        action: { label: 'Abrir o fecho', to: `/privado/fecho?p=${blocked[0]!.id}`, finance: true },
        confidence: 'Enquanto houver regras por definir, os custos, o resultado e o livre do período ficam por calcular.',
      },
    })
  }

  // 3 / 4 · Against the previous comparable period
  const ch = h.changes.previous
  if (!ch || !h.previous) {
    const reason = prevMeta.reason ?? 'no_previous_period'
    skipped.push({ kind: 'production_up_result_down', reason }, { kind: 'production_decline', reason })
  } else {
    const prod = ch.production_minor, res = ch.operating_result_minor
    // a figure hidden for privacy (07 D9 · B11) arrives as null: nothing is built from it
    if (cur.private_fields.includes('operating_result_minor') || h.previous.private_fields.includes('operating_result_minor'))
      skipped.push({ kind: 'production_up_result_down', reason: 'figure_hidden' })
    if (prod.percent !== null && res.percent !== null && prod.percent >= t.productionUpPct && res.percent <= -t.resultDropPct) {
      const drivers = costDrivers(h, money).slice(0, t.maxDrivers)
      out.push({
        id: `production_up_result_down:${cur.period.id}`, kind: 'production_up_result_down', severity: 'ATTENTION',
        periods: [{ id: cur.period.id, label: cur.period.label }],
        title: `A produção subiu ${pct(prod.percent)} face a ${prevLabel}, mas o resultado operacional desceu ${pct(res.percent)}.`,
        detail: {
          current: `Produção ${money(cur.production_minor)} · resultado ${money(cur.operating_result_minor ?? 0)}`,
          reference: `Produção ${money(h.previous.production_minor)} · resultado ${money(h.previous.operating_result_minor ?? 0)}`,
          change: `Produção +${pct(prod.percent)} · resultado −${pct(res.percent)}`,
          basis: `${cur.period.label} comparado com ${prevLabel} (fechado).`,
          drivers,
          confidence: drivers.length ? 'Custos que mais subiram no mesmo período; não indica que tenham sido a causa.' : 'Sem um custo que se destaque.',
        },
      })
    }
    if (prod.percent !== null && prod.percent <= -t.productionDropPct) {
      if (cur.services_count < t.minServices) skipped.push({ kind: 'production_decline', reason: 'not_enough_services' })
      else out.push({
        id: `production_decline:${cur.period.id}`, kind: 'production_decline', severity: 'ATTENTION',
        periods: [{ id: cur.period.id, label: cur.period.label }],
        title: `A produção desceu ${pct(prod.percent)} face a ${prevLabel}.`,
        detail: {
          current: `${money(cur.production_minor)} · ${plural(cur.services_count, 'serviço', 'serviços')}`,
          reference: `${money(h.previous.production_minor)} · ${plural(h.previous.services_count, 'serviço', 'serviços')}`,
          change: `${money(prod.delta_minor ?? 0)} (−${pct(prod.percent)})`,
          basis: `${cur.period.label} comparado com ${prevLabel} (fechado).`,
          drivers: [],
          confidence: `Com ${plural(cur.services_count, 'serviço registado', 'serviços registados')} (mínimo ${t.minServices}).`,
        },
      })
    }
  }

  // 5 · Expense categories above their average over the last completed comparable periods, one grouped insight
  if (!h.changes.average_3 || !h.average_3) {
    skipped.push({ kind: 'expense_category_high', reason: h.meta.comparison.average_3.reason ?? 'insufficient_history' })
  } else {
    const high = h.expense_categories.filter((c) => {
      const avg = c.average_3_minor
      if (avg === null || avg <= 0 || (c.reference_presence ?? 0) < t.categoryMinPresence) return false
      const excess = c.current_minor - avg
      return c.current_minor >= avg * (1 + t.categoryAbovePct / 100) && excess >= cur.production_minor * t.categoryMinImpactPctOfProduction / 100
    })
    if (high.length > 0) {
      const above = (c: (typeof high)[number]) => ((c.current_minor - c.average_3_minor!) * 100) / c.average_3_minor!
      const used = h.average_3.periods.map((p) => p.label).join(', ')
      out.push({
        id: `expense_category_high:${cur.period.id}`, kind: 'expense_category_high', severity: 'ATTENTION',
        periods: [{ id: cur.period.id, label: cur.period.label }],
        title: high.length === 1
          ? `${high[0]!.label}: ${money(high[0]!.current_minor)}, ${pct(above(high[0]!))} acima da média dos últimos ${t.averageWindow} períodos.`
          : `${high.length} categorias de despesa acima da média dos últimos ${t.averageWindow} períodos.`,
        detail: {
          current: high.map((c) => `${c.label} ${money(c.current_minor)}`).join(' · '),
          reference: high.map((c) => `${c.label} média ${money(c.average_3_minor!)}`).join(' · '),
          change: high.map((c) => `${c.label} +${money(c.current_minor - c.average_3_minor!)} (+${pct(above(c))})`).join(' · '),
          basis: `Média de ${used} (fechados).`,
          drivers: high.map((c) => ({ label: c.label, delta_minor: c.current_minor - c.average_3_minor!, text: `+${money(c.current_minor - c.average_3_minor!)} acima da média` })),
          confidence: `Categoria presente em pelo menos ${t.categoryMinPresence} dos ${t.averageWindow} períodos; o excesso passa ${t.categoryMinImpactPctOfProduction}% da produção.`,
        },
      })
    }
  }

  // 6 · Team concentration (Slice 02), when the team figures of the same period are at hand
  if (team && team.period.id === cur.period.id) {
    const c = teamConcentration(team, t)
    if (c.insight) out.push(c.insight); else if (c.skipped) skipped.push(c.skipped)
  }

  out.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
  return { insights: out.slice(0, t.maxShown), skipped }
}

/** Operating cost components that rose against the previous period, largest first; expense categories inside. */
export function costDrivers(h: BusinessHealth, money: (minor: number) => string): Driver[] {
  const ch = h.changes.previous
  if (!ch) return []
  const parts: Driver[] = []
  const add = (label: string, delta: number | null) => { if (delta !== null && delta > 0) parts.push({ label, delta_minor: delta, text: `+${money(delta)}` }) }
  add('Ganhos da equipa', ch.team_earnings_minor.delta_minor)
  add('Compras (parte do salão)', ch.purchases_salon_minor.delta_minor)
  const exp = ch.expenses_minor.delta_minor
  if (exp !== null && exp > 0) {
    const cats = h.expense_categories.filter((c) => c.previous_minor !== null && c.current_minor - c.previous_minor > 0)
      .sort((a, b) => (b.current_minor - b.previous_minor!) - (a.current_minor - a.previous_minor!))
    const top = cats[0]
    parts.push({ label: 'Despesas', delta_minor: exp, text: `+${money(exp)}${top ? ` · sobretudo ${top.label} +${money(top.current_minor - top.previous_minor!)}` : ''}` })
  }
  return parts.sort((a, b) => b.delta_minor - a.delta_minor)
}

/** Why a comparison is not shown, in the screen's words. */
export const COMPARISON_UNAVAILABLE: Record<ComparisonReason, string> = {
  current_incomplete: 'O período ainda está a decorrer: a comparação fica disponível quando terminar.',
  no_previous_period: 'Ainda não há um período anterior para comparar.',
  previous_not_closed: 'O período anterior ainda não está fechado: os valores dele podem mudar.',
  previous_not_comparable: 'O período anterior tem uma duração diferente e não é comparável.',
  insufficient_history: 'Ainda não há períodos fechados suficientes para uma média.',
}

/** Shares of the period's production taken by the largest and the two largest contributions, in whole percent, as the
 *  read model gives them (unnamed, for every viewer); null without production. */
export function concentration(team: BusinessTeam): { top: number; topTwo: number } | null {
  const { top_share_pct: top, top_two_share_pct: topTwo } = team.summary
  return top === null || topTwo === null ? null : { top, topTwo }
}

/** Insight 6 · how much of the production rests on one or two professionals. A business-structure observation, not an
 *  evaluation of anyone: no names in the title, no ranking, the same wording whoever it is. */
export function teamConcentration(team: BusinessTeam, t: InsightThresholds = INSIGHT_THRESHOLDS): { insight?: Insight; skipped?: SkippedInsight } {
  const c = concentration(team)
  if (!c) return {}
  const one = c.top >= t.concentrationTopPct, two = c.topTwo >= t.concentrationTopTwoPct
  if (!one && !two) return {}
  if (team.summary.active_count < t.concentrationMinProfessionals) return { skipped: { kind: 'team_concentration', reason: 'not_enough_professionals' } }
  const p = team.period
  return { insight: {
    id: `team_concentration:${p.id}`, kind: 'team_concentration', severity: 'ATTENTION', periods: [{ id: p.id, label: p.label }],
    title: one ? `${pct(c.top)} da produção está concentrada num profissional.` : `${pct(c.topTwo)} da produção está concentrada em dois profissionais.`,
    detail: {
      current: `Maior contributo ${pct(c.top)} · dois maiores ${pct(c.topTwo)} · ${plural(team.summary.active_count, 'profissional ativo', 'profissionais ativos')}`,
      basis: one ? `Um profissional tem pelo menos ${t.concentrationTopPct}% da produção de ${p.label}.`
                 : `Os dois maiores contributos somam pelo menos ${t.concentrationTopTwoPct}% da produção de ${p.label}.`,
      drivers: [],
      action: { label: 'Ver a equipa', to: `/privado/negocio/equipa?p=${p.id}`, finance: false },
      confidence: 'Descreve como a produção se distribui neste período; não avalia ninguém.',
    },
  } }
}
