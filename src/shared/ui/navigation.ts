// Mobile back/history contract (UX foundation slice; UI behaviour only — no command, permission or data change):
// - app-bar back goes back in history when the screen was reached inside the app, else replaces with its parent;
// - each step of a capture flow is a history entry (`?passo=N`), so Android/browser back returns to the previous step
//   with everything typed still there;
// - leaving a flow with unsaved data (app bar, Android/browser back, any route change) asks first (useBlocker);
// - after a successful save the step entries are unwound, so back never reopens the submitted form;
// - an open sheet is a history entry of its own, so back closes it before leaving the screen — unless it holds an
//   unsaved draft (`sheetDirty`), in which case back asks first, like leaving the flow.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, useLocation, useNavigate } from 'react-router'

type NavState = Record<string, unknown> | null
const STEP_PARAM = 'passo'

const hasSheet = (state: unknown) => typeof (state as { sheet?: unknown } | null)?.sheet === 'string'

const withoutSheet = (state: unknown): NavState => {
  if (!state || typeof state !== 'object') return null
  const rest = Object.fromEntries(Object.entries(state).filter(([k]) => k !== 'sheet'))
  return Object.keys(rest).length > 0 ? rest : null
}

// Whether an app entry lies behind this screen. Decided when the screen mounts: the router's first entry has the key
// 'default' (deep link, first load); a later replace gives the entry a new key but not a new position, so it must not
// change the answer.
function useHasAppHistory() {
  const key = useLocation().key
  const [has] = useState(() => key !== 'default')
  return has
}

/** Back in history when this screen was reached inside the app; otherwise (deep link, first load) replace with `parent`. */
export function useAppBack(parent: string) {
  const navigate = useNavigate()
  const hasHistory = useHasAppHistory()
  return useCallback(() => {
    if (hasHistory) navigate(-1)
    else navigate(parent, { replace: true })
  }, [hasHistory, navigate, parent])
}

export type Flow = {
  /** The step to show (1…steps). A step reached without its data shows step 1 and is replaced by it. */
  step: number
  /** Set by finish(): the saved state, shown whatever history entry the person lands on. */
  completed: boolean
  /** Forward pushes one entry per step; backward goes back in history (the earlier entries are this flow's steps). */
  goTo: (step: number) => void
  /** After a successful command: show the success state and unwind the step entries (no stale form behind it). */
  finish: () => void
  /** "Registar outro …": a fresh first step on the current entry. */
  restart: () => void
  /** × / "Sair sem guardar": back to where the flow was opened (or `parent`); asks first when there is unsaved data. */
  exit: () => void
  /** A named destination ("Voltar a Hoje"): back when the flow was opened from there, else replace with it. */
  leaveTo: (to: string) => void
  /** The pending "discard?" question while a navigation is held: leaving the flow, or closing a sheet with a draft. */
  discard: { open: boolean; reason: 'leave' | 'sheet'; confirm: () => void; cancel: () => void }
  /** Let the next navigation through unasked (a sheet closing because its draft was just saved, or after "Descartar"). */
  allowNext: () => void
}

export function useFlow({ steps, parent, dirty, sheetDirty = false, reachable }: {
  steps: number; parent: string; dirty: boolean; sheetDirty?: boolean; reachable: (step: number) => boolean
}): Flow {
  const location = useLocation()
  const navigate = useNavigate()
  const [completed, setCompleted] = useState(false)
  const hasHistory = useHasAppHistory()
  const base = withoutSheet(location.state)

  const raw = new URLSearchParams(location.search).get(STEP_PARAM)
  const n = raw === null ? 1 : Number(raw)
  const valid = Number.isInteger(n) && n >= 1 && n <= steps
  const misplaced = !completed && (!valid || (n > 1 && !reachable(n)))
  const step = misplaced ? 1 : n

  // A step entry without its data (deep link, reload, a stale forward entry) becomes the first step.
  useEffect(() => {
    if (misplaced) navigate({ pathname: location.pathname, search: '' }, { replace: true, state: base })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [misplaced])

  // Held for "Descartar?": leaving the flow's route with unsaved data, and a back that would close a sheet holding an
  // unsaved draft. Moving between the flow's own steps, or closing a clean sheet, never is.
  const bypass = useRef(false)
  const blocker = useBlocker(useCallback(({ currentLocation, nextLocation }) => {
    if (bypass.current) { bypass.current = false; return false }
    if (completed) return false
    if (currentLocation.pathname !== nextLocation.pathname) return dirty || sheetDirty
    return sheetDirty && hasSheet(currentLocation.state) && !hasSheet(nextLocation.state)
  }, [dirty, sheetDirty, completed]))
  const heldReason = blocker.state === 'blocked' && blocker.location.pathname === location.pathname ? 'sheet' : 'leave'

  // Reload / closing the tab with unsaved data: the browser's own confirmation.
  useEffect(() => {
    if (!dirty || completed) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, completed])

  return {
    step,
    completed,
    goTo: (target) => {
      if (target < step) navigate(target - step)
      else if (target > step) navigate({ pathname: location.pathname, search: `?${STEP_PARAM}=${target}` }, { state: base })
    },
    finish: () => {
      setCompleted(true)
      if (step > 1) navigate(1 - step)
    },
    restart: () => {
      setCompleted(false)
      navigate({ pathname: location.pathname, search: '' }, { replace: true, state: base })
    },
    exit: () => {
      if (hasHistory) navigate(-1)
      else navigate(parent, { replace: true })
    },
    leaveTo: (to) => {
      if (hasHistory && (location.state as { from?: string } | null)?.from === to) navigate(-1)
      else navigate(to, { replace: true })
    },
    discard: {
      open: blocker.state === 'blocked',
      reason: heldReason,
      confirm: () => blocker.proceed?.(),
      cancel: () => blocker.reset?.(),
    },
    allowNext: () => { bypass.current = true },
  }
}

export type SheetSlot<T> = {
  /** The open sheet's content, or null. */
  current: T | null
  /** Open a sheet: one history entry, so Android/browser back closes it. */
  open: (content: T) => void
  /** Change what the open sheet shows (same history entry). */
  update: (content: T) => void
  /** Close from the sheet itself (×, Cancelar, done): goes back over the sheet's entry. */
  close: () => void
  /** Leave the screen from inside the sheet: the sheet's entry is replaced by the destination. */
  leaveTo: (to: string, state?: NavState) => void
}

/** One sheet at a time per screen, backed by the history entry it opened. */
export function useSheet<T>(): SheetSlot<T> {
  const location = useLocation()
  const navigate = useNavigate()
  const [id] = useState(() => `sheet-${Math.random().toString(36).slice(2, 10)}`)
  const [content, setContent] = useState<T | null>(null)
  const isOpen = (location.state as { sheet?: string } | null)?.sheet === id
  return {
    current: isOpen ? content : null,
    open: (c) => {
      setContent(c)
      if (!isOpen) navigate({ pathname: location.pathname, search: location.search }, { state: { ...(withoutSheet(location.state) ?? {}), sheet: id } })
    },
    update: (c) => setContent(c),
    close: () => {
      setContent(null)
      if (isOpen) navigate(-1)
    },
    leaveTo: (to, state = null) => navigate(to, { replace: true, state }),
  }
}
