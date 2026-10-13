// Shared bottom sheet: a modal dialog above everything (portal), scrollable within a max height, clear of the bottom
// safe area. Focus moves into it (to [data-autofocus] when present), stays inside, and returns when it closes.
// Escape and a tap on the backdrop dismiss it only when `dismissible` — a sheet holding typed data passes false.
// Back-button behaviour comes from the caller's history entry (useSheet) or navigation blocker (DiscardSheet).
import { useEffect, useRef, type ReactNode, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function BottomSheet({ labelledBy, onDismiss, dismissible = true, children }: {
  labelledBy: string; onDismiss?: () => void; dismissible?: boolean; children: ReactNode
}) {
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const el = body.current!
    ;(el.querySelector<HTMLElement>('[data-autofocus]') ?? el).focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  const dismiss = dismissible && onDismiss ? onDismiss : undefined
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape' && dismiss) { e.stopPropagation(); dismiss(); return }
    if (e.key !== 'Tab') return
    const items = [...body.current!.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (items.length === 0) { e.preventDefault(); return }
    const first = items[0]!, last = items[items.length - 1]!
    if (e.shiftKey && (document.activeElement === first || document.activeElement === body.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return createPortal(
    <div className="sheet" onClick={dismiss}>
      <div ref={body} className="sheet-body" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}
        onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
