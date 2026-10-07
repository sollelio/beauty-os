// Pagamentos (Slice 06 F11/F12c) and Confirmar pagamento (F11b/E2). Payments apply against the approved amount;
// a higher amount is blocked; a lower one warns and is recorded as Parcial (the policy itself stays open, 07 I2).
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { listPaymentMethods, servicesKeys } from '../../modules/services/api'
import { confirmPayment, type ApprovalLine, type Fecho } from '../../modules/period/api'
import { formatAmount, formatMoney, wholeUnitsToMinor } from '../../shared/money'
import { AmountField } from '../../shared/ui/AmountField'
import { stateLine, useFecho, when } from './fecho'
import { Boundary, FechoHeader, KV, Loading, Pill } from './ui'

const STATUS: Record<ApprovalLine['status'], [string, 'neutral' | 'ok' | 'review']> = {
  por_pagar: ['Por pagar', 'neutral'], pago: ['Pago', 'ok'], parcial: ['Parcial', 'review'], nada_a_pagar: ['Nada a pagar', 'ok'],
}

export function PaymentsPage() {
  const org = useOrganization()
  const navigate = useNavigate()
  const { q, to } = useFecho()
  const [open, setOpen] = useState<string | null>(null)
  if (!q.data) return <Loading q={q} />
  const f = q.data, a = f.approval
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const line = a?.lines.find((l) => l.person_id === open)

  return (
    <main className="app-main">
      <header className="stack" style={{ gap: '0.5rem' }}>
        <FechoHeader title="Pagamentos" back={() => navigate(to('/privado/fecho'))} />
        <h1 style={{ fontSize: '1.5rem' }}>{stateLine(f)}</h1>
        {a && <span className="muted" style={{ fontSize: '0.875rem' }}>aprovado por {a.approved_by} · {when(a.approved_at, org.timezone)} · {a.lines.filter((l) => l.approved_minor > 0).length} pagamentos</span>}
      </header>

      {!a ? (
        <>
          <KV rows={[['A pagar · por aprovar', f.position.pending.length ? '—' : m(f.position.payable_minor)]]} />
          <p className="muted" style={{ margin: 0 }}>Os pagamentos só podem ser confirmados depois de aprovar os valores a pagar.</p>
        </>
      ) : (
        <>
          <div className="totals-card num" data-testid="payment-totals">
            <span><span className="label">Aprovado</span><strong>{m(a.total_minor)}</strong></span>
            <span><span className="label">Pago</span><strong>{m(a.paid_minor)}</strong></span>
            <span><span className="label">Por pagar</span><strong>{m(a.outstanding_minor)}</strong></span>
          </div>
          <section className="stack" style={{ gap: 0 }}>
            {a.lines.map((l) => {
              const [label, kind] = STATUS[l.status]
              const sub = l.status === 'nada_a_pagar' ? (l.excess_minor > 0 ? `adiantamentos ${g(l.advances_minor)} acima do ganho ${g(l.earned_minor)}` : 'nada a pagar')
                : l.status === 'pago' && l.last ? `${g(l.paid_minor)} · ${l.last.method_label.toLocaleLowerCase('pt-PT')} · ${when(l.last.paid_at, org.timezone)} · ${l.last.confirmed_by}`
                : l.status === 'parcial' && l.last ? `pago ${g(l.paid_minor)} · ${l.last.method_label.toLocaleLowerCase('pt-PT')} · ${when(l.last.paid_at, org.timezone)} · ${l.last.confirmed_by} · falta ${g(l.outstanding_minor)} · aprovado ${g(l.approved_minor)}`
                : `aprovado ${g(l.approved_minor)} = ganho ${g(l.earned_minor)} − adiant. ${g(l.advances_minor)}`
              const payable = l.outstanding_minor > 0 && f.readiness.can_pay
              const body = (
                <>
                  <span className="avatar" aria-hidden>{l.display_name.slice(0, 1)}</span>
                  <span className="grow"><span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><strong>{l.display_name}</strong><Pill kind={kind}>{label}</Pill></span>
                    <span className="muted num" style={{ display: 'block', fontSize: '0.8125rem' }}>{sub}</span></span>
                  <span className="num amount-cell">{m(l.status === 'pago' ? l.paid_minor : l.outstanding_minor)}</span>
                </>
              )
              return payable ? <button key={l.person_id} className="prow" onClick={() => setOpen(l.person_id)}>{body}</button> : <div key={l.person_id} className="prow">{body}</div>
            })}
          </section>
          <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>Toque numa pessoa por pagar para confirmar o pagamento ou o que falta. Cada pagamento fica registado com valor, forma, data e quem confirmou, e aparece na situação da pessoa.</p>
        </>
      )}
      {line && <ConfirmPaymentSheet f={f} line={line} onClose={() => setOpen(null)} />}
    </main>
  )
}

function ConfirmPaymentSheet({ f, line, onClose }: { f: Fecho; line: ApprovalLine; onClose: () => void }) {
  const org = useOrganization()
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const methods = useQuery({ queryKey: servicesKeys.paymentMethods, queryFn: listPaymentMethods })
  const prefill = String(Math.round(line.outstanding_minor / 10 ** org.currency_exponent))
  const [digits, setDigits] = useState(prefill)
  const [methodId, setMethodId] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const amount = wholeUnitsToMinor(digits, org) ?? 0
  const lower = amount > 0 && amount < line.outstanding_minor
  const higher = amount > line.outstanding_minor
  const method = methods.data?.find((x) => x.id === methodId)
  return (
    <div className="sheet" role="dialog" aria-labelledby="cp-title" onClick={onClose}>
      <div className="sheet-body" style={{ maxHeight: '92dvh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="flow-header-row"><h2 id="cp-title" style={{ fontSize: '1.25rem' }}>Confirmar pagamento · {line.display_name}</h2><button className="icon-btn" aria-label="Fechar" onClick={onClose}>×</button></div>
        {step === 1 ? (
          <>
            <span className="muted num">{line.paid_minor > 0 ? `Falta ${m(line.outstanding_minor)} · aprovado ${g(line.approved_minor)}` : `Aprovado ${m(line.approved_minor)} = ganho ${g(line.earned_minor)} − adiantamentos ${g(line.advances_minor)}`}</span>
            <span className="label">Valor pago</span>
            <AmountField label="Valor pago" value={digits} onChange={setDigits} symbol={org.currency_symbol} />
            {lower && (
              <div className="notice notice-warning" role="status">
                Valor diferente do aprovado. Ficam por pagar {m(line.outstanding_minor - amount)} a {line.display_name}; o período não fecha enquanto houver valores por pagar. A decisão é de quem confirma e fica registada.
                <button className="link-btn" style={{ display: 'block' }} onClick={() => setDigits(prefill)}>Repor {m(line.outstanding_minor)}</button>
              </div>
            )}
            {higher && <div className="notice notice-error" role="alert">Não pode pagar mais do que está aprovado ({m(line.outstanding_minor)}).</div>}
            <div className="segmented" role="group" aria-label="Forma de pagamento">
              {methods.data?.map((x) => <button key={x.id} className="seg" aria-pressed={methodId === x.id} onClick={() => setMethodId(x.id)}>{x.label}</button>)}
            </div>
            <span className="muted">Data · hoje</span>
            <button className="btn btn-primary" disabled={amount <= 0 || higher || !methodId} onClick={() => setStep(2)}>{lower ? 'Confirmar mesmo assim' : 'Continuar'}</button>
          </>
        ) : (
          <Boundary permission="payment.confirm" run={confirmPayment} input={{ periodId: f.period.id, personId: line.person_id, amountMinor: amount, methodId: methodId ?? '' }}
            intro="Este pagamento tem de ser confirmado por uma pessoa autorizada." label="Confirmar pagamento" onSuccess={onClose} onBack={() => setStep(1)}
            lockNote={`Fica no histórico com data e quem confirmou. Aparece na situação de ${line.display_name} como pagamento.`}>
            <KV rows={[['Pessoa', line.display_name], ['Valor pago', m(amount)], ['Forma de pagamento', method?.label ?? ''], ['Data', 'hoje'],
                       ...(lower ? [['Fica por pagar', m(line.outstanding_minor - amount)] as [string, string]] : [])]} />
          </Boundary>
        )}
      </div>
    </div>
  )
}
