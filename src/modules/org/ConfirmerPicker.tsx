// "Quem confirma?" + PIN inside a Confirmação necessária boundary (Slices 02–03). The mechanism is ADR-0009;
// its visual form is a placeholder pending product input (05 §3).
import { useQuery } from '@tanstack/react-query'
import { listConfirmers, verificationKeys, type ConfirmPermission } from './api'




export function ConfirmerPicker({ confirmerId, onConfirmer, secret, onSecret, permission = 'movement.confirm' }: {
  confirmerId: string | null; onConfirmer: (id: string) => void; secret: string; onSecret: (s: string) => void; permission?: ConfirmPermission
}) {
  const confirmers = useQuery({ queryKey: verificationKeys.confirmers(permission), queryFn: () => listConfirmers(permission) })
  return (
    <div className="stack">
      <span className="label">Quem confirma?</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {confirmers.data?.map((c) => (
          <button key={c.id} className="seg" style={{ flex: '0 0 auto', padding: '0 1rem' }} aria-pressed={confirmerId === c.id} onClick={() => onConfirmer(c.id)}>{c.display_name}</button>
        ))}
        {confirmers.data?.length === 0 && <span className="muted">Nenhuma pessoa autorizada configurada.</span>}
      </div>
      <label className="field">
        <input type="password" inputMode="numeric" autoComplete="off" aria-label="PIN" placeholder="PIN" value={secret}
          onChange={(e) => onSecret(e.target.value.replace(/\D/g, '').slice(0, 6))} />
      </label>
    </div>
  )
}
