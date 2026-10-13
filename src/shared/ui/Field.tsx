// One field: a visible label tied to its input (hidden only when the screen already names it), the box with optional
// leading icon / trailing affix, and a hint or error line the input is described by. The caller gives the input; Field
// wires id, aria-describedby and aria-invalid onto it so every screen gets the same association for free.
import { cloneElement, useId, type ReactElement, type ReactNode } from 'react'

export function Field({ id, label, hideLabel, hint, error, leading, trailing, children }: {
  id?: string; label: string; hideLabel?: boolean; hint?: ReactNode; error?: ReactNode; leading?: ReactNode; trailing?: ReactNode
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>
}) {
  const auto = useId()
  const inputId = id ?? auto
  const hintId = `${inputId}-hint`
  const message = error ?? hint
  const input = cloneElement(children, {
    id: inputId,
    'aria-describedby': message ? hintId : undefined,
    'aria-invalid': error ? true : undefined,
  })
  return (
    <div className="form-field">
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : 'label'}>{label}</label>
      <div className={error ? 'field field-invalid' : 'field'}>
        {leading && <span className="field-icon">{leading}</span>}
        {input}
        {trailing && <span className="field-affix">{trailing}</span>}
      </div>
      {message && <p id={hintId} className={error ? 'form-hint form-hint-error' : 'form-hint'}>{message}</p>}
    </div>
  )
}
