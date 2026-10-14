// Regra do período (Slice 06 F5/F9 → F5b/F9b): facts, a percentage, the person's own earlier values as chips (never
// a default), and "Se confirmar X%" from the database preview (ADR-0004). Nothing is recorded until confirmed.
// On the mobile shell (UX slice 7): two steps that are history entries (back from Confirmação returns to the typed
// percentage), leaving with a typed percentage asks first, and a confirmed rule returns to where the flow was opened
// with no flow screen left behind. The preview behaviour of slice 4 is unchanged: typing never blanks the screen.
import { useState } from 'react'
import { useParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { decidePeriodRule, fechoKeys, getRulePreview } from '../../modules/period/api'
import { formatAmount, formatMoney } from '../../shared/money'
import { AppScreen, BottomActionBar } from '../../shared/ui/AppShell'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { Field } from '../../shared/ui/Field'
import { useFlow } from '../../shared/ui/navigation'
import { ErrorState } from '../../shared/ui/states'
import { PrivateBar } from '../privado/PrivateBar'
import { useFecho } from './fecho'
import { BoundaryScreen, KV, Loading } from './ui'

const pct = (n: number | null) => `${String(Number(n)).replace('.', ',')}%`

export function RuleFlow() {
  const org = useOrganization()
  const { personId = '' } = useParams()
  const { q, to } = useFecho()
  const [digits, setDigits] = useState('')
  const percent = digits === '' ? null : Number(digits)
  const valid = percent !== null && percent >= 0 && percent <= 100
  const parent = to('/privado/fecho')
  const flow = useFlow({ steps: 2, parent, dirty: digits !== '', reachable: () => valid })
  const periodId = q.data?.period.id ?? ''
  // Each percentage is its own query; the previous preview stays on screen (dimmed) while the next one loads, so typing
  // never unmounts the input. Only the very first load shows the loading screen.
  const preview = useQuery({ queryKey: fechoKeys.rulePreview(periodId, personId, valid ? percent : null),
    queryFn: () => getRulePreview(periodId, personId, valid ? percent : null), enabled: Boolean(periodId), placeholderData: keepPreviousData })
  // A failed recalculation drops the placeholder, so the last good preview is remembered (state derived during render,
  // the React pattern for "what the previous renders had"): the screen stays and says so.
  const [lastGood, setLastGood] = useState<typeof preview.data>()
  if (preview.data && preview.data !== lastGood) setLastGood(preview.data)
  const current = preview.data ?? lastGood
  const recalculating = preview.isPlaceholderData || preview.isFetching
  const stale = recalculating || preview.isError
  if (!q.data || !current) return <Loading q={q.isError ? q : preview} title="Regra do período" />
  const f = q.data
  const p = current
  const x = p.person, cur = p.current
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const discard = <DiscardSheet open={flow.discard.open} title="Sair sem definir a regra?" detail="A percentagem escrita perde-se. Nada foi registado."
    onDiscard={flow.discard.confirm} onKeep={flow.discard.cancel} />
  if (f.period.state !== 'aberto') {
    return (
      <AppScreen bar={<PrivateBar title="Regra do período" onBack={flow.exit} />}>
        <div className="notice notice-warning" role="status">A regra só pode ser definida ou alterada enquanto o período estiver aberto.</div>
        <button className="btn btn-secondary" onClick={flow.exit}>Voltar ao Fecho</button>
      </AppScreen>
    )
  }
  const others = p.after.pending.filter((y) => y.person_id !== personId)
  const excess = valid && (x.excess_minor ?? 0) > 0
  const earnedLine = valid && x.earned_minor !== null ? `${m(x.earned_minor)} = ${pct(percent)} × ${g(x.production.total_minor)}` : '—'
  const payLine = valid && x.earned_minor !== null
    ? excess ? `${m(0)} = ${g(x.earned_minor)} − ${g(x.advances.total_minor)} = ${g(x.difference_minor ?? 0)} → mostra 0`
      : `${m(x.remaining_minor ?? 0)} = ${g(x.earned_minor)} − ${g(x.advances.total_minor)}${x.payments.count ? ` − ${g(x.payments.total_minor)}` : ''}`
    : '—'
  const bar = <PrivateBar title="Regra do período" onBack={flow.step === 2 ? () => flow.goTo(1) : flow.exit} step={{ current: flow.step, total: 2 }} exit={false} />

  if (flow.step === 2) {
    return (
      <>
        <BoundaryScreen bar={bar} permission="period.decide" run={decidePeriodRule} input={{ periodId: f.period.id, personId, percent: percent ?? 0 }}
          intro="A regra só fica definida depois de confirmada por uma pessoa autorizada."
          lockNote="Fica no histórico com quem definiu e quando. Enquanto o período estiver aberto pode ser alterada, com registo da alteração."
          label="Confirmar regra" onSuccess={() => flow.finishTo(parent)} onBack={() => flow.goTo(1)}>
          <KV rows={[['Pessoa', x.display_name], ['Período', f.period.label], ['Regra', `${pct(percent)} para ${x.display_name}`],
                     ['Para o salão', pct(x.rule.salon_percent)], ['Ganho', earnedLine], ['Falta receber', payLine]]} />
        </BoundaryScreen>
        {discard}
      </>
    )
  }
  return (
    <AppScreen bar={bar}
      actions={
        <BottomActionBar>
          <span className="bar-summary support">Nada fica registado até confirmar.</span>
          <button className="btn btn-primary btn-tall" disabled={!valid || stale} onClick={() => flow.goTo(2)}>Continuar</button>
        </BottomActionBar>
      }>
      <section className="stack stack-loose">
        <div className="row-between" style={{ justifyContent: 'flex-start' }}>
          <span className="avatar" aria-hidden>{x.display_name.slice(0, 1)}</span>
          <span className="stack stack-tight"><h2>{x.display_name} · {f.period.label}</h2>
            <span className="support">{[...x.capabilities, ...(x.is_owner ? ['sócio'] : [])].join(' · ')}</span></span>
        </div>
        <div className="notice notice-neutral">
          {x.is_owner ? 'Sócio e profissional: a regra de serviços e a distribuição são decisões separadas; nenhuma deriva da outra.'
            : `A remuneração de ${x.display_name} depende de uma decisão por período; até lá não há valor ganho nem a receber.`}
        </div>
        {cur.rule.decided && <p className="note">Regra actual: {pct(cur.rule.percent)} · definida neste fecho</p>}
        <KV rows={[['Produção', `${x.production.count} serviços · ${m(x.production.total_minor)}`],
                   ['Adiantamentos', x.advances.count ? `${x.advances.count} · ${m(x.advances.total_minor)}` : 'nenhum']]} />
        <div className="stack">
          <Field label={`Percentagem para ${x.display_name}`} trailing="%"
            hint={valid ? `${pct(x.rule.salon_percent)} para o salão` : undefined}
            error={digits !== '' && !valid ? 'Indique uma percentagem entre 0 e 100.' : undefined}>
            <input inputMode="numeric" value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          </Field>
          {p.history.length > 0 && (
            <div className="wrap" role="group" aria-label="Regras anteriores">
              {p.history.map((h) => <button key={h.starts_on} type="button" className="chip chip-outline" onClick={() => setDigits(String(Number(h.percent)))}>{pct(h.percent)} · {h.period_label.slice(0, 3).toLocaleLowerCase('pt-PT')}</button>)}
            </div>
          )}
        </div>
        {preview.isError && <ErrorState onRetry={() => preview.refetch()}>Não foi possível calcular esta regra. Os valores abaixo são os anteriores.</ErrorState>}
        {valid && (
          <section className={stale ? 'stack busy' : 'stack'} aria-busy={recalculating || undefined} data-testid="rule-effect">
            <span className="label">Se confirmar {pct(percent)}</span>
            {recalculating && <span className="support" role="status">A recalcular…</span>}
            <KV rows={[['Ganho', earnedLine], ['Falta receber', payLine],
              p.after.livre_minor !== null
                ? ['Livre para os sócios', `${m(p.after.livre_minor)} = ${g(p.base_minor)} − ${g(x.earned_minor ?? 0)}${excess ? ` − ${g(x.excess_minor ?? 0)}` : ''}`]
                : ['Sobra · antes das regras por definir', `${m(p.after.sobra_minor)} = ${g(p.base_minor)} − ${g(x.earned_minor ?? 0)}${excess ? ` − ${g(x.excess_minor ?? 0)}` : ''}`]]} />
            {excess && <span className="notice notice-warning">Com esta regra, {x.display_name} recebeu mais do que ganhou: {m(x.excess_minor ?? 0)} acima do ganho, a rever.</span>}
            {others.length > 0 && <span className="support">Ainda sem {others.map((y) => y.display_name).join(' e ')}: o valor livre só fica completo com todas as regras.</span>}
            {x.is_owner && p.after.owners_decision && (
              <KV rows={[['Distribuição já registada', p.after.owners_decision.kind === 'none' ? 'Sem distribuição' : m(p.after.distribution_minor ?? 0)],
                         ['Não distribuído', p.after.undistributed_minor === null ? '—' : m(p.after.undistributed_minor)]]} />
            )}
            {(p.after.undistributed_minor ?? 0) < 0 && <span className="notice notice-warning">Com esta regra, a distribuição registada passa o valor livre. Fica para rever.</span>}
          </section>
        )}
      </section>
      {discard}
    </AppScreen>
  )
}
