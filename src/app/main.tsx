import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { router } from './router'
import { createQueryClient } from '../shared/query/queryClient'
import { ConfigError, readSupabaseConfig } from '../shared/config/env'
import { ConfigErrorScreen } from './ConfigErrorScreen'
import { registerServiceWorker } from './registerServiceWorker'
import { armBootBrandFailsafe, dismissBootBrand } from './bootBrand'
import { BootBrandGate } from './BootBrandGate'
import './base.css'

armBootBrandFailsafe()   // the brand painted by index.html never stays over an uncaught error
const root = createRoot(document.getElementById('root')!)

try {
  readSupabaseConfig() // fail fast and clearly if the environment is incomplete
  root.render(
    <StrictMode>
      <BootBrandGate>
        <QueryClientProvider client={createQueryClient()}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </BootBrandGate>
    </StrictMode>,
  )
  registerServiceWorker()
} catch (error) {
  dismissBootBrand()
  if (!(error instanceof ConfigError)) throw error
  root.render(<ConfigErrorScreen message={error.message} />)
}
