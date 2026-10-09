// A Business Health insight, collapsed to its title; "porquê?" opens how it was reached. Shared by the Negócio pages.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { Insight } from '../../modules/business/insights'

const SEVERITY_LABEL = { ACTION_REQUIRED: 'Ação necessária', ATTENTION: 'Atenção', INFORMATION: 'Informação' } as const

export function InsightCard({ insight: i, finance }: { insight: Insight; finance: boolean }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const d = i.detail
  const rows: [string, string | undefined][] = [['Agora', d.current], ['Referência', d.reference], ['Variação', d.change], ['Base', d.basis]]
  return (
    <article className="stack" style={{ gap: '0.5rem' }} data-testid="insight" data-kind={i.kind}>
      <button className="xrow" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden className={`xdot xdot-${i.severity === 'ACTION_REQUIRED' ? 'amber' : 'neutral'}`} />
        <span className="grow"><strong style={{ display: 'block' }}>{i.title}</strong>
          <span className="muted" style={{ fontSize: '0.8125rem' }}>{SEVERITY_LABEL[i.severity]} · {open ? 'esconder' : 'porquê?'}</span></span>
      </button>
      {open && (
        <div className="stack" style={{ gap: '0.5rem' }} data-testid="insight-detail">
          <dl className="kv-card">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>
          {d.drivers.length > 0 && <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>{d.drivers.map((x) => <li key={x.label} className="num">{x.label} {x.text}</li>)}</ul>}
          <span className="muted" style={{ fontSize: '0.875rem' }}>{d.confidence}</span>
          {d.action && (!d.action.finance || finance) && <button className="btn btn-secondary" onClick={() => navigate(d.action!.to)}>{d.action.label}</button>}
        </div>
      )}
    </article>
  )
}
