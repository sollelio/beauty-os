// Pagamentos (Slice 06 F11/F12c) and Confirmar pagamento (F11b/E2). Payments apply against the approved amount;
// a higher amount is blocked; a lower one warns and is recorded as Parcial (the policy itself stays open, 07 I2).
// On the mobile shell (UX slice 7): whole rows (only a person with something to pay opens the sheet), the payment sheet
// as a history entry whose typed amount or chosen method is not dropped by back unasked.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { listPaymentMethods, servicesKeys } from '../../modules/services/api'
import { confirmPayment, type ApprovalLine, type Fecho } from '../../modules/period/api'
import { formatAmount, formatMoney, wholeUnitsToMinor } from '../../shared/money'
import { AmountField } from '../../shared/ui/AmountField'
import { AppScreen } from '../../shared/ui/AppShell'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack } from '../../shared/ui/navigation'
import { SegmentedControl } from '../../shared/ui/SegmentedControl'
import { ErrorState, Skeleton } from '../../shared/ui/states'
import { PrivateBar } from '../privado/PrivateBar'
import { stateLine, useFecho, when } from './fecho'
import { KV, Loading, Pill, SheetBoundary } from './ui'
import { useDraftSheet } from './hooks'

const STATUS: Record<ApprovalLine['status'], [string, 'neutral' | 'ok' | 'review']> = {
  por_pagar: ['Por pagar', 'neutral'], pago: ['Pago', 'ok'], parcial: ['Parcial', 'review'], nada_a_pagar: ['Nada a pagar', 'ok'],
}

export function PaymentsPage() {
  const org = useOrganization()
  const { q, to } = useFecho()
  const back = useAppBack(to('/privado/fecho'))
  const sheets = useDraftSheet<string>(to('/privado/fecho'), 'Descartar este pagamento?')
  if (!q.data) return <Loading q={q} title="Pagamentos" />
  const f = q.data, a = f.approval
  const m = (n: number) => formatMoney(n, org)
  const g = (n: number) => formatAmount(n, org)
  const line = a?.lines.find((l) => l.person_id === sheets.current)

  return (
    <AppScreen bar={<PrivateBar title="Pagamentos" onBack={back} />}>
      <section className="stack stack-tight">
        <h1>{stateLine(f)}</h1>
        {a && <span className="support">aprovado por {a.approved_by} · {when(a.approved_at, org.timezone)} · {a.lines.filter((l) => l.approved_minor > 0).length} pagamentos</span>}
      </section>

      {!a ? (
        <>
          <KV rows={[['A pagar · por aprovar', f.position.pending.length ? '—' : m(f.position.payable_minor)]]} />
          <p className="note">Os pagamentos só podem ser confirmados depois de aprovar os valores a pagar.</p>
        </>
      ) : (
        <>
          <div className="totals-card num" data-testid="payment-totals">
            <span><span className="label">Aprovado</span><strong>{m(a.total_minor)}</strong></span>
            <span><span className="label">Pago</span><strong>{m(a.paid_minor)}</strong></span>
            <span><span className="label">Por pagar</span><strong>{m(a.outstanding_minor)}</strong></span>
          </div>
          <ListGroup>
            {a.lines.map((l) => {
              const [label, kind] = STATUS[l.status]
              const sub = l.status === 'nada_a_pagar' ? (l.excess_minor > 0 ? `adiantamentos ${g(l.advances_minor)} acima do ganho ${g(l.earned_minor)}` : 'nada a pagar')
                : l.status === 'pago' && l.last ? `${g(l.paid_minor)} · ${l.last.method_label.toLocaleLowerCase('pt-PT')} · ${when(l.last.paid_at, org.timezone)} · ${l.last.confirmed_by}`
                : l.status === 'parcial' && l.last ? `pago ${g(l.paid_minor)} · ${l.last.method_label.toLocaleLowerCase('pt-PT')} · ${when(l.last.paid_at, org.timezone)} · ${l.last.confirmed_by} · falta ${g(l.outstanding_minor)} · aprovado ${g(l.approved_minor)}`
                : `aprovado ${g(l.approved_minor)} = ganho ${g(l.earned_minor)} − adiant. ${g(l.advances_minor)}`
              const payable = l.outstanding_minor > 0 && f.readiness.can_pay
              const slots = {
                leading: <span className="avatar row-avatar" aria-hidden>{l.display_name.slice(0, 1)}</span>,
                title: <span className="title-line">{l.display_name}<Pill kind={kind}>{label}</Pill></span>,
                subtitle: <span className="num">{sub}</span>,
                trailing: <span className="num amount-cell">{m(l.status === 'pago' ? l.paid_minor : l.outstanding_minor)}</span>,
              }
              return payable ? <ListRow key={l.person_id} as="button" onClick={() => sheets.open(l.person_id)} chevron {...slots} /> : <ListRow key={l.person_id} {...slots} />
            })}
          </ListGroup>
          <p className="note support">Toque numa pessoa por pagar para confirmar o pagamento ou o que falta. Cada pagamento fica registado com valor, forma, data e quem confirmou, e aparece na situação da pessoa.</p>
        </>
      )}
      {line && <ConfirmPaymentSheet f={f} line={line} onDirty={sheets.setDirty} onClose={sheets.close} onDone={sheets.done} />}
      {sheets.discard}
    </AppScreen>
  )
}

function ConfirmPaymentSheet({ f, line, onDirty, onClose, onDone }: { f: Fecho; line: ApprovalLine; onDirty: (d: boolean) => void; onClose: () => void; onDone: () => void }) {
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
  const dirty = step === 2 || digits !== prefill || methodId !== null
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  return (
    <BottomSheet labelledBy="cp-title" onDismiss={onClose} dismissible={!dirty}>
      <div className="row-between">
        <h2 id="cp-title" className="sheet-title">Confirmar pagamento · {line.display_name}</h2>
        <button className="icon-btn" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
      </div>
      {step === 1 ? (
        <>
          <span className="support num">{line.paid_minor > 0 ? `Falta ${m(line.outstanding_minor)} · aprovado ${g(line.approved_minor)}` : `Aprovado ${m(line.approved_minor)} = ganho ${g(line.earned_minor)} − adiantamentos ${g(line.advances_minor)}`}</span>
          <AmountField label="Valor pago" value={digits} onChange={setDigits} symbol={org.currency_symbol} />
          {lower && (
            <div className="notice notice-warning stack" role="status">
              <span>Valor diferente do aprovado. Ficam por pagar {m(line.outstanding_minor - amount)} a {line.display_name}; o período não fecha enquanto houver valores por pagar. A decisão é de quem confirma e fica registada.</span>
              <button className="link-btn self-start" onClick={() => setDigits(prefill)}>Repor {m(line.outstanding_minor)}</button>
            </div>
          )}
          {higher && <div className="notice notice-error" role="alert">Não pode pagar mais do que está aprovado ({m(line.outstanding_minor)}).</div>}
          {methods.isPending && <Skeleton rows={1} />}
          {methods.isError && <ErrorState onRetry={() => methods.refetch()}>Não foi possível carregar as formas de pagamento.</ErrorState>}
          {methods.data && <SegmentedControl label="Forma de pagamento" options={methods.data.map((x) => ({ id: x.id, label: x.label }))} value={methodId} onChange={setMethodId} />}
          <span className="support">Data · hoje</span>
          <button className="btn btn-primary btn-tall" disabled={amount <= 0 || higher || !methodId} onClick={() => setStep(2)}>{lower ? 'Confirmar mesmo assim' : 'Continuar'}</button>
        </>
      ) : (
        <>
          <button className="link-btn self-start" onClick={() => setStep(1)}><Icon name="back" size={18} />Voltar ao valor</button>
          <SheetBoundary permission="payment.confirm" run={confirmPayment} input={{ periodId: f.period.id, personId: line.person_id, amountMinor: amount, methodId: methodId ?? '' }}
            intro="Este pagamento tem de ser confirmado por uma pessoa autorizada." label="Confirmar pagamento" onSuccess={onDone} onBack={() => setStep(1)}
            lockNote={`Fica no histórico com data e quem confirmou. Aparece na situação de ${line.display_name} como pagamento.`}>
            <KV rows={[['Pessoa', line.display_name], ['Valor pago', m(amount)], ['Forma de pagamento', method?.label ?? ''], ['Data', 'hoje'],
                       ...(lower ? [['Fica por pagar', m(line.outstanding_minor - amount)] as [string, string]] : [])]} />
          </SheetBoundary>
        </>
      )}
    </BottomSheet>
  )
}
