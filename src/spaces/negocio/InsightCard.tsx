// A Business Health insight, collapsed to its title; "porquê?" (or "Ver detalhe" on Negócio → Insights) opens how it
// was reached. Shared by the Negócio pages. The hub variant also shows the summary, the source area and the period, and
// links to the area where it can be investigated.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { SEVERITY_LABEL, SOURCE_AREA, type Insight } from '../../modules/business/insights'

export function InsightCard({ insight: i, finance, hub = false }: { insight: Insight; finance: boolean; hub?: boolean }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const d = i.detail
  const area = SOURCE_AREA[i.source]
  const rows: [string, string | undefined][] = [['Agora', d.current], ['Referência', d.reference], ['Variação', d.change], ['Base', d.basis],
    ...(hub ? [['Períodos', i.periods.map((p) => p.label).join(', ')] as [string, string]] : [])]
  const periods = i.periods.map((p) => p.label).join(', ')
  return (
    <article className="stack" style={{ gap: '0.5rem' }} data-testid="insight" data-kind={i.kind} data-severity={i.severity}>
      <button className="xrow" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden className={`xdot xdot-${i.severity === 'ACTION_REQUIRED' ? 'amber' : 'neutral'}`} />
        <span className="grow"><strong style={{ display: 'block' }}>{i.title}</strong>
          {hub && i.summary !== i.title && <span style={{ display: 'block', fontSize: '0.875rem' }} className="num">{i.summary}</span>}
          <span className="muted" style={{ fontSize: '0.8125rem' }}>
            {SEVERITY_LABEL[i.severity]}{hub ? ` · ${area.label} · ${periods}` : ''} · {open ? 'esconder' : hub ? 'Ver detalhe' : 'porquê?'}
          </span></span>
      </button>
      {open && (
        <div className="stack" style={{ gap: '0.5rem' }} data-testid="insight-detail">
          <dl className="kv-card">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>
          {d.drivers.length > 0 && <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>{d.drivers.map((x) => <li key={x.label} className="num">{x.label} {x.text}</li>)}</ul>}
          <span className="muted" style={{ fontSize: '0.875rem' }}>{d.confidence}</span>
          {d.action && (!d.action.finance || finance) && <button className="btn btn-secondary" onClick={() => navigate(d.action!.to)}>{d.action.label}</button>}
          {hub && <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => navigate(`${area.path}?p=${i.period_id}`)}>Investigar em {area.label}</button>}
        </div>
      )}
    </article>
  )
}
