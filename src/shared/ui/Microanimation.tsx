// Educational microanimation (learning experience L3): a short CSS/SVG demonstration that plays only when the person
// asks, once (never on its own, never in a loop), and can be replayed. Under prefers-reduced-motion it never animates:
// the same story is shown as static frames. The stage is decorative (aria-hidden); the frames are its text equivalent
// and always stay available to screen readers. The stage's own steps are the caller's children: CSS animations that
// run only under `.is-playing`, each element ending in its final state (fill forwards). `StillExplanation` is the same
// story without any stage, for content that has no animation in a given context.
import { useEffect, useId, useState, type ReactNode } from 'react'

export type MicroFrame = { title: string; text: string }

const REDUCED = '(prefers-reduced-motion: reduce)'

/** Follows the person's reduced-motion preference, including changes while the screen is open. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED).matches)
  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia?.(REDUCED) : undefined
    if (!mq) return
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

/** The frames as a numbered list: visible (still) or screen-reader only (beside a playing stage). */
function FrameList({ title, frames, className }: { title: string; frames: MicroFrame[]; className: string }) {
  return (
    <ol className={className} role="list" aria-label={`${title}, passo a passo`}>
      {frames.map((f, i) => (
        <li key={i}><span className="microanim-n" aria-hidden="true">{i + 1}</span><span><strong>{f.title}</strong> {f.text}</span></li>
      ))}
    </ol>
  )
}

/** A still explanation: the frames only, nothing to start and nothing that moves. */
export function StillExplanation({ title, frames }: { title: string; frames: MicroFrame[] }) {
  const id = useId()
  return (
    <section className="panel microanim" aria-labelledby={`${id}-title`}>
      <div className="stack stack-tight">
        <span className="row-title" id={`${id}-title`}>{title}</span>
        <span className="support">Explicação · funciona sem ligação</span>
      </div>
      <FrameList title={title} frames={frames} className="microanim-frames" />
    </section>
  )
}

export function Microanimation({ title, durationMs, frames, children }: {
  title: string; durationMs: number; frames: MicroFrame[]; children: ReactNode
}) {
  const reduced = usePrefersReducedMotion()
  const id = useId()
  const [run, setRun] = useState(0)                 // 0: not played yet; every play mounts a fresh stage (a true replay)
  const [playing, setPlaying] = useState(false)
  // only to know when the one run has ended (to offer «Ver outra vez»); nothing waits on it
  useEffect(() => {
    if (!playing) return
    const t = setTimeout(() => setPlaying(false), durationMs)
    return () => clearTimeout(t)
  }, [playing, run, durationMs])

  const list = (className: string) => <FrameList title={title} frames={frames} className={className} />

  return (
    <section className="panel microanim" aria-labelledby={`${id}-title`}>
      <div className="stack stack-tight">
        <span className="row-title" id={`${id}-title`}>{title}</span>
        <span className="support">Animação · {Math.ceil(durationMs / 1000)} s · funciona sem ligação</span>
      </div>
      {reduced ? (
        // reduced motion: the same story, still — nothing moves and nothing needs to be started
        list('microanim-frames')
      ) : (
        <>
          <div key={run} className={run > 0 ? 'microanim-stage is-playing' : 'microanim-stage'} aria-hidden="true">{children}</div>
          {list('sr-only')}
          <button type="button" className="btn btn-secondary btn-fit microanim-play" disabled={playing} aria-describedby={`${id}-title`}
            onClick={() => { setRun((r) => r + 1); setPlaying(true) }}>
            {playing ? 'A mostrar…' : run === 0 ? 'Ver' : 'Ver outra vez'}
          </button>
        </>
      )}
    </section>
  )
}
