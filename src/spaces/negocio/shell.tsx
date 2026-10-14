// Negócio on the mobile shell (UX slice 8): the private bar (back within the private area; Visão geral is the root
// for a business-only holder, so × exits there), the period context every page opens with, and one loading / error
// treatment. Presentation only: every figure still comes from the redacted reads (07 D9 · B11), and a context the
// server says has ended drops the private cache, as before.
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useOrganization } from '../../modules/org/OrganizationContext'
import type { PeriodRef } from '../../modules/business/api'
import { STATE_LABEL } from '../../modules/period/api'
import { toAppError } from '../../shared/errors'
import { formatDayShort } from '../../shared/time'
import { AppScreen } from '../../shared/ui/AppShell'
import { Field } from '../../shared/ui/Field'
import { Icon } from '../../shared/ui/Icon'
import { ErrorState, Skeleton } from '../../shared/ui/states'

/** First load, or why the page cannot be shown — inside the private bar, with a way back that stays in the area. */
export function NegocioState({ bar, error, what, onBack }: { bar: ReactNode; error?: unknown; what: string; onBack: () => void }) {
  const code = error ? toAppError(error).code : null
  return (
    <AppScreen bar={bar}>
      {error ? (
        <ErrorState action={<button type="button" className="link-btn" onClick={onBack}>Voltar</button>}>
          {code === 'NOT_AUTHORIZED' ? 'Esta área é só para quem acompanha o negócio.' : `Não foi possível mostrar ${what}.`}
        </ErrorState>
      ) : <Skeleton rows={4} headline />}
    </AppScreen>
  )
}

/** Which period the page reads: its name, dates and state, and the period choice (the device's own picker). */
export function PeriodContext({ period, periods }: { period: PeriodRef & { is_complete: boolean }; periods?: PeriodRef[] }) {
  const org = useOrganization()
  const [, setSp] = useSearchParams()
  return (
    <section className="stack" data-testid="period-context">
      <span className="stack stack-tight">
        <h1>{period.label}</h1>
        <span className="support">
          {formatDayShort(period.starts_on, org.timezone)} – {formatDayShort(period.ends_on, org.timezone)} · {STATE_LABEL[period.state]}
          {period.is_complete ? '' : ' · a decorrer'}
        </span>
      </span>
      {periods && periods.length > 1 && (
        <Field label="Período" hideLabel trailing={<Icon name="chevronDown" />}>
          <select value={period.id} onChange={(e) => setSp({ p: e.target.value }, { replace: true })}>
            {periods.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </Field>
      )}
    </section>
  )
}

/** Label → value pairs as one quiet group (a <dl>: the label is the term, the figure its definition). `lead` gives the
 *  values the money typography of a summary. */
export function ValueList({ rows, testId, lead }: { rows: [ReactNode, ReactNode][]; testId?: string; lead?: boolean }) {
  return (
    <dl className={lead ? 'row-group value-list value-list-lead' : 'row-group value-list'} data-testid={testId}>
      {rows.map(([k, v], i) => <div key={i} className="row value-row"><dt>{k}</dt><dd className="num">{v}</dd></div>)}
    </dl>
  )
}

/** A section title, with an optional quiet figure on the right (a total). */
export function SectionHead({ id, children, aside }: { id?: string; children: ReactNode; aside?: ReactNode }) {
  return <div className="section-head"><h2 id={id} className="label">{children}</h2>{aside}</div>
}
