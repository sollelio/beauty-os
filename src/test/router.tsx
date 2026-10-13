// Renders a screen inside a data router (needed by useBlocker), with stub Hoje and destination routes, so tests can
// drive and inspect history: router.navigate(-1) is the Android/browser back button.
import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, type InitialEntry, type RouteObject } from 'react-router'
import { OrganizationContext } from '../modules/org/OrganizationContext'

export const testOrg = { id: 'o', name: 'Org', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }

export function renderScreen(path: string, element: ReactNode, { entries, index, routes = [], org = testOrg }: {
  entries?: InitialEntry[]; index?: number; routes?: RouteObject[]; org?: typeof testOrg
} = {}) {
  const router = createMemoryRouter([
    { path: '/', element: <p>Ecrã Hoje</p> },
    { path, element },
    ...routes,
    { path: '*', element: <p>Outro ecrã</p> },
  ], { initialEntries: entries ?? [path], initialIndex: index })
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <OrganizationContext.Provider value={org}><RouterProvider router={router} /></OrganizationContext.Provider>
    </QueryClientProvider>,
  )
  return { router, ...view }
}

/** Opened from Hoje: [Hoje, the flow] — back and "Voltar a Hoje" return to that Hoje entry. */
export const fromHoje = (path: string): { entries: InitialEntry[]; index: number } => ({
  entries: ['/', { pathname: path, state: { from: '/' } }], index: 1,
})
