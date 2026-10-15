import type { ReactNode } from 'react'
import { isOfflineMode, useOfflineRuntime } from '../shared/offline/runtime'
import { AppBar, AppScreen } from '../shared/ui/AppShell'
import { useAppBack } from '../shared/ui/navigation'
import { PRIVATE_NEEDS_CONNECTION } from '../shared/ui/offlineCopy'

// Online-only areas (ADR-0010 §1, §4): without a connection — or while the app runs on the cached binding, which is
// never authorization — the area is not opened at all, so no private request or cache is involved.
export function RequireConnection({ title, message = PRIVATE_NEEDS_CONNECTION, children }: { title: string; message?: string; children: ReactNode }) {
  const runtime = useOfflineRuntime()
  const back = useAppBack('/')
  if (!isOfflineMode(runtime)) return <>{children}</>
  return (
    <AppScreen bar={<AppBar title={title} leading="back" onLeading={back} />}>
      <div className="notice notice-neutral" role="status" data-testid="needs-connection">{message}</div>
    </AppScreen>
  )
}
