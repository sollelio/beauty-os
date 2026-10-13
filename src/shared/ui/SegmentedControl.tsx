// One control for choosing one of a few options (2–3 short labels side by side). Labels are tenant data, so when any is
// long (Multicaixa Express, Transferência) or there are more than three, the same buttons stack into full-width rows
// with a check mark instead of squeezing or breaking words. Not for choosing people (PinConfirm / tiles do that).
export const LONG_LABEL = 12

export type SegmentOption = { id: string; label: string }

export function SegmentedControl({ label, hideLabel, options, value, onChange }: {
  label: string; hideLabel?: boolean; options: readonly SegmentOption[]; value: string | null; onChange: (id: string) => void
}) {
  const stacked = options.length > 3 || options.some((o) => o.label.length > LONG_LABEL)
  return (
    <div className="stack">
      {!hideLabel && <span className="label">{label}</span>}
      <div className={stacked ? 'segmented segmented-stack' : 'segmented'} role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} type="button" className="seg" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
        ))}
      </div>
    </div>
  )
}
