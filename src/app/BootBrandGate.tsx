// The React side of the Brand Splash (bootBrand.ts): the gate decides after the app's first commit; a pending marker
// holds the brand while the app is genuinely still loading. Layout effects, so the decision follows the commit itself.
import { useLayoutEffect, type ReactNode } from 'react'
import { holdBootBrand, settleBootBrand } from './bootBrand'

/** Wraps the whole app: after its first commit the brand leaves, unless a <BootPending /> holds it. */
export function BootBrandGate({ children }: { children: ReactNode }) {
  useLayoutEffect(() => settleBootBrand(), [])
  return <>{children}</>
}

/** Rendered only inside a real loading state (DeviceGate); the brand leaves when the last one unmounts. */
export function BootPending() {
  useLayoutEffect(() => holdBootBrand(), [])
  return null
}
