import { Outlet } from 'react-router'
import { ConnectivityBanner } from '../shared/ui/OfflineStatus'

export function RootLayout() {
  return (
    <>
      <ConnectivityBanner />
      <Outlet />
    </>
  )
}
