import { Outlet } from 'react-router'

export function RootLayout() {
  return (
    <div className="app-root">
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
