// Numerário / Transferência / Misto with the two mixed fields and the live sum sentence (Slice 01, reused by Slice 03).
import { AmountField } from './AmountField'

export type PaymentChoice = 'numerario' | 'transferencia' | 'mixed'

export function PaymentFields({ label, method, onMethod, mixed, onMixed, sentence, symbol }: {
  label: string; method: PaymentChoice; onMethod: (m: PaymentChoice) => void
  mixed: [string, string]; onMixed: (m: [string, string]) => void; sentence: string | null; symbol: string
}) {
  return (
    <div className="stack">
      <span className="label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {([['numerario', 'Numerário'], ['transferencia', 'Transferência'], ['mixed', 'Misto']] as const).map(([code, text]) => (
          <button key={code} className="seg" aria-pressed={method === code} onClick={() => onMethod(code)}>{text}</button>
        ))}
      </div>
      {method === 'mixed' && (
        <div className="stack">
          <AmountField label="Numerário" value={mixed[0]} onChange={(v) => onMixed([v, mixed[1]])} placeholder="" symbol={symbol} />
          <AmountField label="Transferência" value={mixed[1]} onChange={(v) => onMixed([mixed[0], v])} placeholder="" symbol={symbol} />
          {sentence && <span className="muted num" data-testid="mixed-sentence">{sentence}</span>}
        </div>
      )}
    </div>
  )
}
