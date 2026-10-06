import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { router } from './router'
import { createQueryClient } from '../shared/query/queryClient'
import { ConfigError, readSupabaseConfig } from '../shared/config/env'
import { ConfigErrorScreen } from './ConfigErrorScreen'
import './base.css'

const root = createRoot(document.getElementById('root')!)

try {
  readSupabaseConfig() // fail fast and clearly if the environment is incomplete
  root.render(
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
} catch (error) {
  if (!(error instanceof ConfigError)) throw error
  root.render(<ConfigErrorScreen message={error.message} />)
}
