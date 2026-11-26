import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { SlowServerNotice } from '@/components/SlowServerNotice'
import { Toaster } from '@/components/ui/sonner'
import { initErrorReporting, reportUncaughtReactError } from '@/lib/error-reporting'
import { createQueryClient } from '@/lib/query-client'
import { routes } from '@/routes'
import './index.css'

initErrorReporting(import.meta.env.VITE_SENTRY_DSN, {
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT,
})

const queryClient = createQueryClient()
const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!, { onUncaughtError: reportUncaughtReactError }).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SlowServerNotice />
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  </StrictMode>,
)
