// Payment method choice with the two mixed fields and the live sum sentence (Slice 01, reused by Slice 03). The methods
// are the organization's own active ones (listPaymentMethods: codes and labels are tenant data, e.g. Numerário /
// Transferência or Dinheiro / Multicaixa Express); nothing here assumes a code. Misto splits the value between two
// methods — offered only when the organization has exactly two active methods (the pilot model, 03 §2 #4).
import type { PaymentMethod } from '../../modules/services/api'
import { MIXED, mixedPair } from '../payment'
import { AmountField } from './AmountField'
import { SegmentedControl } from './SegmentedControl'

export function PaymentFields({ label, methods, choice, onChoice, allowMixed = true, mixed, onMixed, sentence, symbol }: {
  label: string; methods: readonly PaymentMethod[]; choice: string | null; onChoice: (c: string) => void; allowMixed?: boolean
  mixed?: [string, string]; onMixed?: (m: [string, string]) => void; sentence?: string | null; symbol: string
}) {
  const pair = allowMixed ? mixedPair(methods) : null
  const options = [...methods.map((m) => ({ id: m.id, label: m.label })), ...(pair ? [{ id: MIXED, label: 'Misto' }] : [])]
  return (
    <div className="stack">
      <SegmentedControl label={label} options={options} value={choice} onChange={onChoice} />
      {pair && choice === MIXED && mixed && onMixed && (
        <div className="stack">
          {pair.map((m, i) => (
            <AmountField key={m.id} label={m.label} value={mixed[i]!} placeholder="" symbol={symbol}
              onChange={(v) => onMixed(i === 0 ? [v, mixed[1]] : [mixed[0], v])} />
          ))}
          {sentence && <span className="support num" data-testid="mixed-sentence">{sentence}</span>}
        </div>
      )}
    </div>
  )
}
