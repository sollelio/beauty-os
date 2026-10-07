// Regra do período (Slice 06 F5/F9 → F5b/F9b): facts, a percentage, the person's own earlier values as chips (never
// a default), and "Se confirmar X%" from the database preview (ADR-0004). Nothing is recorded until confirmed.
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { decidePeriodRule, fechoKeys, getRulePreview } from '../../modules/period/api'
import { formatAmount, formatMoney } from '../../shared/money'
import { useFecho } from './fecho'
import { Boundary, KV, Loading } from './ui'

const pct = (n: number | null) => `${String(Number(n)).replace('.', ',')}%`

export function RuleFlow() {
  const org = useOrganization()
  const navigate = useNavigate()
  const { personId = '' } = useParams()
  const { q, to } = useFecho()
  const [digits, setDigits] = useState('')
  const [step, setStep] = useState<1 | 2>(1)
  const percent = digits === '' ? null : Number(digits)
  const valid = percent !== null && percent >= 0 && percent <= 100
  const periodId = q.data?.period.id ?? ''
  const preview = useQuery({ queryKey: fechoKeys.rulePreview(periodId, personId, valid ? percent : null),
    queryFn: () => getRulePreview(periodId, personId, valid ? percent : null), enabled: Boolean(periodId) })
  if (!q.data || !preview.data) return <Loading q={q.isError ? q : preview} />
  const f = q.data
  const p = preview.data
  const x = p.person, cur = p.current
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const back = () => (step === 2 ? setStep(1) : navigate(to('/privado/fecho')))
  if (f.period.state !== 'aberto') {
    return <main className="app-main"><div className="notice notice-warning">A regra só pode ser definida ou alterada enquanto o período estiver aberto.</div>
      <button className="btn btn-secondary" onClick={() => navigate(to('/privado/fecho'))}>Voltar ao Fecho</button></main>
  }
  const others = p.after.pending.filter((y) => y.person_id !== personId)
  const excess = valid && (x.excess_minor ?? 0) > 0
  const earnedLine = valid && x.earned_minor !== null ? `${m(x.earned_minor)} = ${pct(percent)} × ${g(x.production.total_minor)}` : '—'
  const payLine = valid && x.earned_minor !== null
    ? excess ? `${m(0)} = ${g(x.earned_minor)} − ${g(x.advances.total_minor)} = ${g(x.difference_minor ?? 0)} → mostra 0`
      : `${m(x.remaining_minor ?? 0)} = ${g(x.earned_minor)} − ${g(x.advances.total_minor)}${x.payments.count ? ` − ${g(x.payments.total_minor)}` : ''}`
    : '—'

  return (
    <main className="app-main">
      <header className="flow-header">
        <div className="flow-header-row">
          <button className="icon-btn" aria-label="Voltar" onClick={back}>←</button>
          <span className="muted" style={{ fontWeight: 600 }}>Regra do período</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span className="priv">Privado</span><span className="label num">{step} / 2</span></span>
        </div>
        <div className="progress" aria-hidden>{[1, 2].map((n) => <span key={n} className={n <= step ? 'on' : ''} />)}</div>
      </header>

      {step === 1 ? (
        <>
          <section className="stack" style={{ gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="avatar" aria-hidden>{x.display_name.slice(0, 1)}</span>
              <span><h2 style={{ fontSize: '1.25rem' }}>{x.display_name} · {f.period.label}</h2>
                <span className="muted" style={{ fontSize: '0.875rem' }}>{[...x.capabilities, ...(x.is_owner ? ['sócio'] : [])].join(' · ')}</span></span>
            </div>
            <div className="notice notice-neutral">
              {x.is_owner ? 'Sócio e profissional: a regra de serviços e a distribuição são decisões separadas; nenhuma deriva da outra.'
                : `A remuneração de ${x.display_name} depende de uma decisão por período; até lá não há valor ganho nem a receber.`}
            </div>
            {cur.rule.decided && <p className="muted" style={{ margin: 0 }}>Regra actual: {pct(cur.rule.percent)} · definida neste fecho</p>}
            <KV rows={[['Produção', `${x.production.count} serviços · ${m(x.production.total_minor)}`],
                       ['Adiantamentos', x.advances.count ? `${x.advances.count} · ${m(x.advances.total_minor)}` : 'nenhum']]} />
            <div className="stack" style={{ gap: '0.375rem' }}>
              <span className="label">Percentagem para {x.display_name}</span>
              <label className="field">
                <input inputMode="numeric" aria-label={`Percentagem para ${x.display_name}`} value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                <span className="muted">%</span>
              </label>
              {valid && <span className="muted" style={{ fontSize: '0.875rem' }}>{pct(x.rule.salon_percent)} para o salão</span>}
              {p.history.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {p.history.map((h) => <button key={h.starts_on} className="chip chip-outline" onClick={() => setDigits(String(Number(h.percent)))}>{pct(h.percent)} · {h.period_label.slice(0, 3).toLocaleLowerCase('pt-PT')}</button>)}
                </div>
              )}
              {digits !== '' && !valid && <span className="notice notice-error">Indique uma percentagem entre 0 e 100.</span>}
            </div>
            {valid && (
              <section className="stack" data-testid="rule-effect">
                <span className="label">Se confirmar {pct(percent)}</span>
                <KV rows={[['Ganho', earnedLine], ['Falta receber', payLine],
                  p.after.livre_minor !== null
                    ? ['Livre para os sócios', `${m(p.after.livre_minor)} = ${g(p.base_minor)} − ${g(x.earned_minor ?? 0)}${excess ? ` − ${g(x.excess_minor ?? 0)}` : ''}`]
                    : ['Sobra · antes das regras por definir', `${m(p.after.sobra_minor)} = ${g(p.base_minor)} − ${g(x.earned_minor ?? 0)}${excess ? ` − ${g(x.excess_minor ?? 0)}` : ''}`]]} />
                {excess && <span className="notice notice-warning">Com esta regra, {x.display_name} recebeu mais do que ganhou: {m(x.excess_minor ?? 0)} acima do ganho, a rever.</span>}
                {others.length > 0 && <span className="muted" style={{ fontSize: '0.875rem' }}>Ainda sem {others.map((y) => y.display_name).join(' e ')}: o valor livre só fica completo com todas as regras.</span>}
                {x.is_owner && p.after.owners_decision && (
                  <KV rows={[['Distribuição já registada', p.after.owners_decision.kind === 'none' ? 'Sem distribuição' : m(p.after.distribution_minor ?? 0)],
                             ['Não distribuído', p.after.undistributed_minor === null ? '—' : m(p.after.undistributed_minor)]]} />
                )}
                {(p.after.undistributed_minor ?? 0) < 0 && <span className="notice notice-warning">Com esta regra, a distribuição registada passa o valor livre. Fica para rever.</span>}
              </section>
            )}
          </section>
          <div className="footer">
            <span className="muted" style={{ textAlign: 'center', fontSize: '0.8125rem' }}>Nada fica registado até confirmar.</span>
            <button className="btn btn-primary btn-tall" disabled={!valid || preview.isFetching} onClick={() => setStep(2)}>Continuar</button>
          </div>
        </>
      ) : (
        <Boundary permission="period.decide" run={decidePeriodRule} input={{ periodId: f.period.id, personId, percent: percent ?? 0 }}
          intro="A regra só fica definida depois de confirmada por uma pessoa autorizada."
          lockNote="Fica no histórico com quem definiu e quando. Enquanto o período estiver aberto pode ser alterada, com registo da alteração."
          label="Confirmar regra" onSuccess={() => navigate(to('/privado/fecho'))} onBack={() => setStep(1)}>
          <KV rows={[['Pessoa', x.display_name], ['Período', f.period.label], ['Regra', `${pct(percent)} para ${x.display_name}`],
                     ['Para o salão', pct(x.rule.salon_percent)], ['Ganho', earnedLine], ['Falta receber', payLine]]} />
        </Boundary>
      )}
    </main>
  )
}
