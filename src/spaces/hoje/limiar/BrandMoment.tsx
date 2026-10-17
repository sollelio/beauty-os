// «Limiar» — the Beauty OS brand moment (Tenant Identity T3; approved refinement «Limiar», motion specification).
// The product presents itself (the symbol opens along its own diagonal cut, the violet plane settles last, the compact
// lockup signs), a hairline opens, the salon is drawn — its ring, then its heart — and named; only the emblem travels,
// landing in Hoje's salon line while Hoje assembles beneath. Its own chunk, loaded only when the moment is presented or
// replayed, never on the start path; precached with the shell, so it also plays offline.
// The salon's part (from 1.65 s) is chosen just before it starts: the emblem when this phone has the organization's
// logo files (T2), otherwise the approved name-only variant — the moment never waits for the network. Ring colour and
// size and the reveal radius come with the organization's logo reference: no salon's design is written here.
// The animated layer is decorative (aria-hidden); a status line announces the binding once. «Saltar» is the first
// focus from the first instant; reduced motion shows the same composition, still, with «Começar».
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { TenantMark } from '../../../modules/org/tenantMark'
import { DESCRIPTOR, SYMBOL_INDIGO, SYMBOL_VIOLET, WORDMARK } from './lockup'
import './limiar.css'

/** The small name in Hoje's salon line has settled (spec: lands at 4.2 s, 260 ms). */
export const LIMIAR_END_MS = 4460
/** The salon's part starts at 1.65 s: the emblem or the name is chosen just before. */
export const LIMIAR_CHOOSE_MS = 1500
const EMBLEM = 160                                             // px, the emblem in the moment (the 512 file, 3×)

export default function BrandMoment({ name, mark, still, onDone, onRunning }: {
  name: string
  /** the organization's logo on this phone, or null; may arrive while the moment runs */
  mark: TenantMark | null
  still: boolean
  onDone: () => void
  /** In motion, Hoje beneath assembles with the moment (`limiar-run`): set before the first paint, cleared on unmount. */
  onRunning: (running: boolean) => void
}) {
  const [chosen, setChosen] = useState<'emblem' | 'name' | null>(null)
  const latest = useRef(mark)
  useEffect(() => { latest.current = mark }, [mark])
  useLayoutEffect(() => {
    if (still) return
    onRunning(true)
    return () => onRunning(false)
  }, [still, onRunning])
  // the timeline is fixed when the moment starts: re-renders of Hoje beneath never restart or shorten it
  useEffect(() => {
    if (still) return
    const choose = setTimeout(() => setChosen(latest.current ? 'emblem' : 'name'), LIMIAR_CHOOSE_MS)
    const end = setTimeout(onDone, LIMIAR_END_MS)
    return () => { clearTimeout(choose); clearTimeout(end) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still])
  const emblem = still ? mark !== null : chosen === 'emblem' || (chosen === null && mark !== null)

  // the emblem's flight: from its place here to the salon line's mark in Hoje — measured once the emblem is chosen,
  // never assumed (Hoje beneath is laid out in place, only transparent). Without a target the emblem stays and goes.
  const emblemBox = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const box = emblemBox.current
    if (still || !emblem || !box || box.dataset.flight) return
    const from = box.getBoundingClientRect()
    const to = document.querySelector('[data-tenant-mark]')?.getBoundingClientRect()
    if (!to || from.width === 0) return
    box.dataset.flight = 'measured'
    box.style.setProperty('--lm-tx', `${to.left - from.left}px`)
    box.style.setProperty('--lm-ty', `${to.top - from.top}px`)
    box.style.setProperty('--lm-s', String(to.width / from.width))
  }, [still, emblem])

  const ring = mark?.ring
  const r = ring ? ring.radius * EMBLEM : 0
  const geometry = { '--lm-iris': `${(mark?.iris ?? 0.71) * 100}%`, '--lm-c': `${2 * Math.PI * r}` } as CSSProperties

  return (
    <div className={still ? 'limiar limiar-still' : 'limiar'} data-testid="limiar" data-variant={emblem ? 'emblem' : chosen ?? (still ? 'name' : 'pending')}>
      <p role="status" className="sr-only">Este telemóvel está ligado a {name}</p>
      <div className="limiar-stage" aria-hidden="true">
        <div className="lm-lockup">
          <svg className="lm-symbol lm-ind" viewBox="0 0 120 112">
            <g transform="translate(7,7)">{SYMBOL_INDIGO.map((d) => <path key={d} fill="#3030A8" d={d} />)}</g>
          </svg>
          <svg className="lm-symbol" viewBox="0 0 120 112">
            <g transform="translate(7,7)"><path className="lm-vio" fill="#7657D6" d={SYMBOL_VIOLET} /></g>
          </svg>
          <svg className="lm-words lm-word" viewBox="120 0 292 112">
            <g fill="#25272B">{WORDMARK.map((d) => <path key={d} d={d} />)}</g>
          </svg>
          <svg className="lm-words lm-desc" viewBox="120 0 292 112">
            <g fill="#7657D6">{DESCRIPTOR.map((d) => <path key={d} d={d} />)}</g>
          </svg>
        </div>
        <span className="lm-hair" />
        <span className="lm-retire"><span className="label lm-kick">Este telemóvel está ligado a</span></span>
        {/* both variants are in place from the start, so every delay keeps the specification's clock */}
        <div className="lm-salon">
          <div className={emblem ? 'lm-variant' : 'lm-variant lm-off'}>
            <div ref={emblemBox} className="lm-emblem" style={geometry}>
              {ring && (
                <svg className="lm-ring-svg" viewBox={`0 0 ${EMBLEM} ${EMBLEM}`}>
                  <circle className="lm-ring" cx={EMBLEM / 2} cy={EMBLEM / 2} r={r} fill="none" stroke={ring.color} strokeWidth={ring.width * EMBLEM}
                    transform={`rotate(-90 ${EMBLEM / 2} ${EMBLEM / 2})`} />
                </svg>
              )}
              <img className="lm-iris" src={mark?.src512} alt="" width={EMBLEM} height={EMBLEM} />
            </div>
            <span className="lm-nameout"><span className="lm-ename">{name}</span></span>
          </div>
          <div className={emblem ? 'lm-variant lm-off' : 'lm-variant'}>
            <span className="lm-retire"><span className="lm-name">{name}</span></span>
          </div>
        </div>
      </div>
      {still
        ? <button type="button" className="btn btn-primary btn-tall lm-start" autoFocus onClick={onDone}>Começar</button>
        : <button type="button" className="lm-skip" autoFocus onClick={onDone}>Saltar</button>}
    </div>
  )
}
