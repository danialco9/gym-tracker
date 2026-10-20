import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { saveCachedUser } from '@/lib/session'
import { renderRoute } from '@/test/render'

const user = { id: 1, email: 'dani@example.com', goal: null, created_at: '2026-09-01T10:00:00+00:00' }

function goOffline() {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
  // Every request fails the way the browser fails them with no network.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('opens the app offline for the last confirmed user', async () => {
  saveCachedUser(user)
  goOffline()

  renderRoute('/')

  expect(await screen.findByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
})

test('opens the app for the last confirmed user while the server is still waking up', async () => {
  saveCachedUser(user)
  // A sleeping server: the request is sent but no answer arrives during the test.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )

  renderRoute('/')

  // The app shell is there at once; only each page's own data waits for the server.
  expect(await screen.findByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
})

test('a remembered user whose session ended is sent to the login page', async () => {
  saveCachedUser(user)
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(null, { status: 401 }))),
  )

  renderRoute('/')

  expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument()
})

test('offline with no remembered session, says the connection failed, not the server', async () => {
  goOffline()

  renderRoute('/')

  await waitFor(() => {
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument()
  })
})
