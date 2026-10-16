// Ajuda routes, loaded lazily (learning experience L2): the help is its own chunk, fetched on the first visit to
// /ajuda and precached by the build with the shell (pwa/serviceWorkerPlugin.ts), so it also opens offline.
import { lazy, Suspense } from 'react'
import { Link, Outlet } from 'react-router'
import { AppBar, AppScreen } from '../../shared/ui/AppShell'
import { useAppBack } from '../../shared/ui/navigation'
import { ErrorState, Skeleton } from '../../shared/ui/states'

const pages = () => import('./HelpPages')
export const HelpHome = lazy(() => pages().then((m) => ({ default: m.HelpHome })))
export const HelpTopicPage = lazy(() => pages().then((m) => ({ default: m.HelpTopicPage })))
export const HelpStepsPage = lazy(() => pages().then((m) => ({ default: m.HelpStepsPage })))

export function HelpLayout() {
  return <Suspense fallback={<main className="app-main"><Skeleton rows={4} label="A carregar a ajuda" /></main>}><Outlet /></Suspense>
}

/** The help could not open (its chunk failed to load — e.g. a first visit without the cached shell and no connection —
 *  or a help screen failed): stay in the app, with a retry and the way back to Hoje. Lives in the main bundle, so it is
 *  there exactly when the help chunk is not. A reload, because a failed lazy import is not retried by itself. */
export function HelpLoadError() {
  const back = useAppBack('/')
  return (
    <AppScreen bar={<AppBar title="Ajuda" leading="back" onLeading={back} />}>
      <ErrorState onRetry={() => window.location.reload()} action={<Link className="link-btn" to="/" replace>Voltar ao Hoje</Link>}>
        Não foi possível abrir a ajuda. Verifique a ligação e tente novamente.
      </ErrorState>
    </AppScreen>
  )
}
