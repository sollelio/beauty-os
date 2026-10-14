// Business Health insights on the mobile shell (UX slice 8): each insight is one whole row (a restrained severity chip above
// its title, which keeps the row's width; on Negócio → Insights also its summary, source area and periods); tapping opens its explanation in a
// sheet — a history entry, so back closes it before the page. The insight itself (what it says, its figures, its
// action) is the engine's, unchanged (modules/business/insights); a Fecho / payments action only for a team-finance
// holder, the Negócio source for everyone (07 D9).
import { useSheet } from '../../shared/ui/navigation'
import { SEVERITY_LABEL, SOURCE_AREA, type Insight, type Severity } from '../../modules/business/insights'
import { BottomSheet } from '../../shared/ui/BottomSheet'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { StatusChip } from '../../shared/ui/StatusChip'

const TONE: Record<Severity, 'warning' | 'caution' | 'neutral'> = { ACTION_REQUIRED: 'warning', ATTENTION: 'caution', INFORMATION: 'neutral' }

export function SeverityChip({ severity }: { severity: Severity }) {
  return <StatusChip tone={TONE[severity]}>{SEVERITY_LABEL[severity]}</StatusChip>
}

/** A group of insight rows sharing one sheet slot. */
export function InsightList({ insights, finance, hub = false }: { insights: Insight[]; finance: boolean; hub?: boolean }) {
  const sheet = useSheet<string>()
  const open = insights.find((i) => i.id === sheet.current)
  return (
    <>
      <ListGroup>
        {insights.map((i) => {
          const periods = i.periods.map((p) => p.label).join(', ')
          return (
            <div key={i.id} className="row-line" data-testid="insight" data-kind={i.kind} data-severity={i.severity}>
              <ListRow as="button" onClick={() => sheet.open(i.id)} chevron
                leading={<span aria-hidden className={i.severity === 'ACTION_REQUIRED' ? 'urgent-dot' : 'dot-quiet'} />}
                title={<span className="insight-head"><SeverityChip severity={i.severity} /><strong>{i.title}</strong></span>}
                subtitle={hub ? <span className="num">{i.summary !== i.title ? `${i.summary} · ` : ''}{SOURCE_AREA[i.source].label} · {periods}</span> : undefined}
              />
            </div>
          )
        })}
      </ListGroup>
      {open && <InsightSheet insight={open} finance={finance} hub={hub} onClose={sheet.close} leaveTo={sheet.leaveTo} />}
    </>
  )
}

function InsightSheet({ insight: i, finance, hub, onClose, leaveTo }: {
  insight: Insight; finance: boolean; hub: boolean; onClose: () => void; leaveTo: (to: string) => void
}) {
  const d = i.detail
  const area = SOURCE_AREA[i.source]
  const rows: [string, string | undefined][] = [['Agora', d.current], ['Referência', d.reference], ['Variação', d.change], ['Base', d.basis],
    ...(hub ? [['Períodos', i.periods.map((p) => p.label).join(', ')] as [string, string]] : [])]
  return (
    <BottomSheet labelledBy="insight-title" onDismiss={onClose}>
      <div className="row-between">
        <span className="stack stack-tight">
          <SeverityChip severity={i.severity} />
          <h2 id="insight-title" className="sheet-title">{i.title}</h2>
        </span>
        <button className="icon-btn self-start" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="stack" data-testid="insight-detail">
        {i.summary !== i.title && <p className="note num">{i.summary}</p>}
        <ListGroup>
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <ListRow key={k} className="kv-row" title={<span className="kv-key">{k}</span>} trailing={<span className="row-value num kv-value">{v}</span>} />
          ))}
        </ListGroup>
        {d.drivers.length > 0 && (
          <ListGroup aria-label="Componentes">
            {d.drivers.map((x) => <ListRow key={x.label} title={x.label} trailing={<span className="row-value num">{x.text}</span>} />)}
          </ListGroup>
        )}
        <p className="note support">{d.confidence}</p>
        <div className="sheet-actions">
          {d.action && (!d.action.finance || finance) && <button className="btn btn-secondary" onClick={() => leaveTo(d.action!.to)}>{d.action.label}</button>}
          {hub && <button className="btn btn-secondary" onClick={() => leaveTo(`${area.path}?p=${i.period_id}`)}>Investigar em {area.label}</button>}
        </div>
      </div>
    </BottomSheet>
  )
}
