// Device enrollment with an operator-issued code (docs/operations/pilot-runbook.md). Optional Turnstile CAPTCHA.
import { useCallback, useState } from 'react'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useQueryClient } from '@tanstack/react-query'
import { enrollDevice, orgKeys } from '../../modules/org/api'
import { toAppError } from '../../shared/errors'
import { useOfflineRuntime } from '../../shared/offline/runtime'
import { Turnstile } from './Turnstile'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || null

const MESSAGES: Record<string, string> = {
  ENROLLMENT_INVALID: 'Código inválido ou expirado.',
  ALREADY_BOUND: 'Este dispositivo já está ligado a uma organização.',
}

export function EnrollmentScreen() {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const onToken = useCallback((t: string | null) => setToken(t), [])
  const runtime = useOfflineRuntime()
  const held = runtime.heldElsewhere
  const [askPurge, setAskPurge] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await enrollDevice(code.trim().toUpperCase(), token ?? undefined)
      await queryClient.invalidateQueries({ queryKey: orgKeys.deviceContext })
    } catch (err) {
      const a = toAppError(err)
      setError(a.kind === 'network' ? 'Sem ligação. Tente novamente.' : (a.code && MESSAGES[a.code]) || 'Não foi possível ligar o dispositivo.')
      if (SITE_KEY) { setToken(null); setResetKey((k) => k + 1) }       // a CAPTCHA token is single-use
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app-main">
      <span className="label">Dispositivo</span>
      <h1>Ligar este dispositivo</h1>
      <p className="muted">Este dispositivo ainda não está ligado a uma organização. Introduza o código de ligação.</p>
      {held > 0 && (
        // work captured under a previous binding stays on the device, untouched, until a person decides (ADR-0010 §6)
        <div className="notice notice-warning" role="status" data-testid="held-elsewhere">
          {held === 1 ? 'Há 1 registo guardado neste telemóvel que não chegou' : `Há ${held} registos guardados neste telemóvel que não chegaram`} ao servidor. Não limpe os dados do navegador: fale com a gestão.
          <button className="link-btn" onClick={() => setAskPurge(true)}>Apagar deste telemóvel</button>
        </div>
      )}
      {askPurge && (
        <ConfirmDialog title="Apagar o trabalho da ligação anterior?" safeLabel="Manter" destructiveLabel="Apagar"
          onSafe={() => setAskPurge(false)} onDestructive={() => { setAskPurge(false); void runtime.discardForeign() }}>
          Estes registos nunca chegaram ao servidor e não vão ser enviados por uma nova ligação. Apagar remove-os só deste telemóvel; não muda nada no servidor. Não pode ser desfeito.
        </ConfirmDialog>
      )}
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span className="label" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Código de ligação</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código de ligação" autoCapitalize="characters" autoComplete="off" />
        </label>
        {SITE_KEY && <Turnstile siteKey={SITE_KEY} onToken={onToken} resetKey={resetKey} />}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-tall" type="submit" disabled={busy || code.trim() === '' || (SITE_KEY !== null && !token)}>
          {busy ? 'A ligar…' : 'Ligar dispositivo'}
        </button>
      </form>
    </main>
  )
}
