// Cloudflare Turnstile widget for the enrollment's anonymous sign-in (ADR-0009 mitigation 4). Rendered only when
// VITE_TURNSTILE_SITE_KEY is set; Supabase Auth must have CAPTCHA enabled with the matching secret.
import { useEffect, useRef } from 'react'

type TurnstileApi = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void }
declare global { interface Window { turnstile?: TurnstileApi } }

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC; s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    s.onerror = () => reject(new Error('turnstile'))
    document.head.appendChild(s)
  })
}

export function Turnstile({ siteKey, onToken, resetKey }: { siteKey: string; onToken: (t: string | null) => void; resetKey: number }) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let id: string | undefined; let cancelled = false
    loadScript().then((ts) => {
      if (cancelled || !el.current) return
      id = ts.render(el.current, { sitekey: siteKey, callback: (t: string) => onToken(t), 'expired-callback': () => onToken(null), 'error-callback': () => onToken(null) })
    }).catch(() => onToken(null))
    return () => { cancelled = true; if (id && window.turnstile) window.turnstile.remove(id) }
  }, [siteKey, onToken, resetKey])
  return <div ref={el} />
}
