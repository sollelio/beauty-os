// Person + PIN verification control (ADR-0009): one pattern for entering the private area and for every one-shot
// Confirmação necessária. Purely the entry: the server verifies (verify_person / the command's grant) and owns lockout;
// the PIN lives only in the caller's state until it is sent, and is cleared on a failed verification.
// - one eligible person is chosen automatically; choosing a person moves focus to the PIN;
// - six digits, numeric keyboard; the cells show progress without revealing digits;
// - the verification error appears under the PIN in space kept for it, so nothing below moves.
import { useEffect, useId, useRef } from 'react'
import type { AppError } from '../../shared/errors'
import { isPinError, VERIFY_MESSAGES } from './verifyMessages'

export const PIN_LENGTH = 6
export type PinPerson = { id: string; display_name: string }

export function PinConfirm({ legend, people, loading, emptyText, personId, onPerson, secret, onSecret, error, messages }: {
  legend: string; people: PinPerson[] | undefined; loading?: boolean; emptyText: string
  personId: string | null; onPerson: (id: string) => void; secret: string; onSecret: (s: string) => void
  /** The last verification/command failure; a person/PIN failure is shown here and clears the PIN. */
  error?: AppError | null; messages?: Record<string, string>
}) {
  const input = useRef<HTMLInputElement>(null)
  const uid = useId(), legendId = `${uid}-legend`, feedbackId = `${uid}-feedback`
  const only = people?.length === 1 ? people[0]!.id : null

  useEffect(() => { if (only && personId !== only) onPerson(only) }, [only, personId, onPerson])
  // focus the PIN — but never take focus from an open dialog this control is not part of (e.g. "Descartar?")
  const focusPin = () => {
    const dialog = document.activeElement?.closest('[role="dialog"]')
    if (!dialog || dialog.contains(input.current)) input.current?.focus()
  }
  useEffect(() => { if (personId) focusPin() }, [personId])
  const pinFailed = isPinError(error)
  useEffect(() => {
    if (!pinFailed) return
    onSecret('')
    focusPin()
  }, [error, pinFailed, onSecret])

  const message = pinFailed && error?.code ? ({ ...VERIFY_MESSAGES, ...messages })[error.code] : null
  return (
    <div className="stack pin-confirm">
      <span className="label" id={legendId}>{legend}</span>
      {loading && !people ? (
        <div className="person-pick" aria-busy="true" aria-labelledby={legendId}><span className="person-skeleton" /><span className="person-skeleton" /></div>
      ) : people && people.length === 0 ? (
        <span className="muted">{emptyText}</span>
      ) : (
        <div className="person-pick" role="group" aria-labelledby={legendId}>
          {people?.map((p) => (
            <button key={p.id} type="button" className="person-option" aria-pressed={personId === p.id} onClick={() => onPerson(p.id)}>
              <span className="person-initial" aria-hidden>{p.display_name.trim().charAt(0).toUpperCase()}</span>
              <span className="person-name">{p.display_name}</span>
            </button>
          ))}
        </div>
      )}
      <label className={`pin${message && secret === '' ? ' pin-invalid' : ''}`}>
        <input ref={input} aria-label="PIN" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off" enterKeyHint="done"
          maxLength={PIN_LENGTH} value={secret} aria-invalid={message ? true : undefined} aria-describedby={feedbackId}
          onChange={(e) => onSecret(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))} />
        <span className="pin-cells" aria-hidden>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span key={i} className={`pin-cell${i < secret.length ? ' filled' : ''}${i === secret.length ? ' next' : ''}`} />
          ))}
        </span>
      </label>
      <p className="pin-feedback" id={feedbackId} aria-live="polite">{message && <span role="alert">{message}</span>}</p>
    </div>
  )
}
