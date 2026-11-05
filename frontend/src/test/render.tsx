import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { createQueryClient } from '@/lib/query-client'
import { routes } from '@/routes'

/**
 * The app's routes with every lazy screen already loaded, as the service worker leaves them after
 * the first visit: a tap shows the next screen at once, so tests need not wait for chunks.
 */
async function loadAll(tree: RouteObject[]): Promise<RouteObject[]> {
  return Promise.all(
    tree.map(async ({ lazy, children, ...route }) => {
      const loaded = typeof lazy === 'function' ? await lazy() : {}
      return {
        ...route,
        ...loaded,
        ...(children && { children: await loadAll(children) }),
      } as RouteObject
    }),
  )
}

const loadedRoutes = await loadAll(routes)

/** Renders the full app route tree at `path` with a fresh query cache. */
export function renderRoute(path: string) {
  // The app's client (with its session handling), without retries so failures show up at once.
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  })
  const router = createMemoryRouter(loadedRoutes, { initialEntries: [path] })
  const user = userEvent.setup()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...view, user, router }
}
