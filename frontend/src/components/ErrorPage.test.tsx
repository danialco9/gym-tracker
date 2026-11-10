import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  sex: null,
  created_at: '2026-09-15T10:00:00Z',
}

describe('A screen that breaks', () => {
  it('shows a friendly page inside the app, with the navigation still there', async () => {
    // React reports the render error; the page logs it too. Neither matters here.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // An answer the home screen cannot read, as from an API out of step with the app.
    mockApi({ 'GET /auth/me': { body: USER }, 'GET /progress/overview': { body: {} } })
    const { user, router } = renderRoute('/')

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('heading', { name: 'Algo ha fallado' })).toBeInTheDocument()
    expect(within(alert).getByText(/Tu entreno en curso sigue guardado en el móvil/)).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Principal' })

    await user.click(within(nav).getByRole('link', { name: /Rutinas/ }))

    expect(router.state.location.pathname).toBe('/rutinas')
    expect(screen.queryByRole('heading', { name: 'Algo ha fallado' })).not.toBeInTheDocument()
  })
})
