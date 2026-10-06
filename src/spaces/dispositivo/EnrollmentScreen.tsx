// Development enrollment only (no production provisioning UI). See README.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { enrollDevice, orgKeys } from '../../modules/org/api'
import { toAppError } from '../../shared/errors'

const MESSAGES: Record<string, string> = {
  ENROLLMENT_INVALID: 'Código inválido ou expirado.',
  ALREADY_BOUND: 'Este dispositivo já está ligado a uma organização.',
}

export function EnrollmentScreen() {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await enrollDevice(code.trim().toUpperCase())
      await queryClient.invalidateQueries({ queryKey: orgKeys.deviceContext })
    } catch (err) {
      const a = toAppError(err)
      setError(a.kind === 'network' ? 'Sem ligação. Tente novamente.' : (a.code && MESSAGES[a.code]) || 'Não foi possível ligar o dispositivo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app-main">
      <span className="label">Dispositivo</span>
      <h1>Ligar este dispositivo</h1>
      <p className="muted">Este dispositivo ainda não está ligado a uma organização. Introduza o código de ligação.</p>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span className="label" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Código de ligação</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código de ligação" autoCapitalize="characters" autoComplete="off" />
        </label>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-tall" type="submit" disabled={busy || code.trim() === ''}>
          {busy ? 'A ligar…' : 'Ligar dispositivo'}
        </button>
      </form>
    </main>
  )
}
