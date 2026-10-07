// Digits-only amount entry in whole units with live "." thousands grouping (Slices 01–03).
export function AmountField({ label, value, onChange, placeholder = '0', symbol }: {
  label: string; value: string; onChange: (digits: string) => void; placeholder?: string; symbol: string
}) {
  return (
    <label className="field">
      <input inputMode="numeric" aria-label={label} placeholder={placeholder} value={value.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 9))} />
      <span className="muted">{symbol}</span>
    </label>
  )
}
