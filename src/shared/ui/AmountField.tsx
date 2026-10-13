// Digits-only amount entry in whole units with live "." thousands grouping (Slices 01–03), on the shared Field.
import type { ReactNode } from 'react'
import { Field } from './Field'

export function AmountField({ id, label, hideLabel, hint, value, onChange, placeholder = '0', symbol, autoFocus }: {
  id?: string; label: string; hideLabel?: boolean; hint?: ReactNode; value: string; onChange: (digits: string) => void
  placeholder?: string; symbol: string; autoFocus?: boolean
}) {
  return (
    <Field id={id} label={label} hideLabel={hideLabel} hint={hint} trailing={symbol}>
      <input inputMode="numeric" enterKeyHint="done" autoComplete="off" autoFocus={autoFocus} placeholder={placeholder}
        value={value.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 9))} />
    </Field>
  )
}
