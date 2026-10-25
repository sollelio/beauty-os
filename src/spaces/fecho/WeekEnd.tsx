// Terminar a semana (ADR-0010 §5 amendment, Slice 2): on the period's last operating day a period.decide holder declares
// the salon's week finished — then no record with a later time enters the period, each phone confirms its state after
// that moment, and the period can be approved. Before the usual closing time it asks first; nothing ends by the clock.
// "Continuar a semana" withdraws it while the period is not approved. Every time comes from the server; the browser's
// clock only decides whether to ask first.
import { useState } from 'react'
import { declareWeekEnd, withdrawWeekEnd, type Fecho, type WeekEnd } from '../../modules/period/api'
import { formatDayShort, formatTime, formatWeekday } from '../../shared/time'
import { SheetBoundary } from './ui'

const STEPS = <ol className="week-steps"><li>Terminar a semana</li><li>Cada telemóvel envia o que tem guardado</li><li>Aprovar os valores</li></ol>

/** The week's state on the Fecho home, while the period is open; null when there is nothing to say. */
export function WeekEndNotice({ we, timeZone }: { we: WeekEnd; timeZone: string }) {
  if (we.declared) {
    const at = we.declared.at
    return (
      <div className="notice notice-success stack stack-tight" role="status" data-testid="week-end-notice">
        <strong>Semana terminada · {formatWeekday(at, timeZone)}, {formatDayShort(at, timeZone)} às {formatTime(at, timeZone)}</strong>
        <span>Por {we.declared.by}{we.declared.early ? ', antes da hora habitual' : ''}. Não entram registos com hora posterior. Cada telemóvel envia o que tem guardado; depois pode aprovar.</span>
      </div>
    )
  }
  if (we.ended || !we.last_operating_day) return null
  const day = `${formatWeekday(we.last_operating_day, timeZone)}, ${formatDayShort(we.last_operating_day, timeZone)}`
  return (
    <div className="notice notice-neutral stack stack-tight" role="status" data-testid="week-end-notice">
      <strong>{we.too_early ? 'A semana ainda está a decorrer' : 'A semana ainda não foi terminada'}</strong>
      <span>{we.too_early ? `Pode terminar a semana a partir de ${day}, quando o expediente acabar.` : 'Quando o último cliente sair, termine a semana. Depois:'}</span>
      {STEPS}
    </div>
  )
}

/** Terminar a semana: before the usual closing time, a question first; then the Confirmação necessária. */
export function DeclareWeekEndSheet({ f, timeZone, onDone, onClose }: { f: Fecho; timeZone: string; onDone: () => void; onClose: () => void }) {
  const we = f.week_end!
  const [asked] = useState(() => we.usual_closing_at !== null && Date.now() < Date.parse(we.usual_closing_at))
  const [confirmed, setConfirmed] = useState(false)
  if (asked && !confirmed) {
    return (
      <div className="stack stack-loose" data-testid="early-warning">
        <div className="notice notice-warning stack stack-tight" role="alert">
          <strong>O salão normalmente funciona até às {formatTime(we.usual_closing_at!, timeZone)}.</strong>
          <span>Tem a certeza de que o expediente desta semana terminou?</span>
        </div>
        <div className="sheet-actions">
          <button className="btn btn-primary btn-tall" onClick={onClose}>Continuar aberto</button>
          <button className="btn btn-secondary" onClick={() => setConfirmed(true)}>Terminar a semana</button>
        </div>
      </div>
    )
  }
  return (
    <SheetBoundary permission="period.decide" run={declareWeekEnd} input={{ periodId: f.period.id }}
      intro="A partir de agora não entram registos com hora posterior neste período. Os telemóveis enviam o que guardaram antes; depois pode aprovar."
      lockNote="Fica no histórico com quem terminou a semana e quando. Enquanto o período não estiver aprovado, pode continuar a semana."
      label="Terminar a semana" onSuccess={onDone} onBack={onClose} />
  )
}

/** Continuar a semana: the period accepts records again; the week can be ended again later. */
export function WithdrawWeekEndSheet({ f, onDone, onClose }: { f: Fecho; onDone: () => void; onClose: () => void }) {
  return (
    <SheetBoundary permission="period.decide" run={withdrawWeekEnd} input={{ periodId: f.period.id }}
      intro="O período volta a aceitar registos. Quando o expediente terminar, termine a semana de novo."
      lockNote="Fica no histórico com quem continuou a semana e quando."
      label="Continuar a semana" onSuccess={onDone} onBack={onClose} />
  )
}
