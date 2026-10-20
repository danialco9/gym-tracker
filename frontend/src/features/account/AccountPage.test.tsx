import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DRAFT_STORAGE_KEY } from '@/features/workout/draft'
import type { User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'

const USER: User = { id: 1, email: 'nuevo@gymtracker.dev', goal: null, created_at: '2026-09-24T10:00:00Z' }

describe('Account', () => {
  it('sends feedback about the screen it was opened from', async () => {
    const calls = mockApi({
      'GET /auth/me': { body: USER },
      'GET /routines': { body: [] },
      'GET /workouts?limit=5': { body: [] },
      'POST /feedback': { status: 204 },
    })
    const { user } = renderRoute('/')

    await user.click(await screen.findByRole('link', { name: 'Cuenta' }))
    expect(await screen.findByText(USER.email)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Enviar opinión/ }))
    await user.type(screen.getByRole('textbox', { name: 'Tu opinión' }), '  No encuentro el temporizador  ')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))

    expect(await screen.findByRole('button', { name: /Enviar opinión/ })).toBeInTheDocument()
    expect(calls.find((call) => call.path === '/feedback')?.body).toEqual({
      message: 'No encuentro el temporizador',
      page: '/',
    })
  })

  it('keeps the account when the password is wrong', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'DELETE /auth/me': { status: 403, body: { detail: 'Incorrect password' } },
    })
    const { user, router } = renderRoute('/cuenta')

    await user.click(await screen.findByRole('button', { name: 'Borrar mi cuenta' }))
    await user.type(screen.getByLabelText(/contraseña/), 'no-es-esta')
    await user.click(screen.getByRole('button', { name: 'Borrar definitivamente' }))

    expect(await screen.findByText('La contraseña no es correcta.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/cuenta')
  })

  it('says the demo account cannot be deleted', async () => {
    mockApi({
      'GET /auth/me': { body: { ...USER, email: 'demo@gymtracker.dev' } },
      'DELETE /auth/me': { status: 403, body: { detail: 'The demo account cannot be deleted' } },
    })
    const { user } = renderRoute('/cuenta')

    await user.click(await screen.findByRole('button', { name: 'Borrar mi cuenta' }))
    await user.type(screen.getByLabelText(/contraseña/), 'lo-que-sea')
    await user.click(screen.getByRole('button', { name: 'Borrar definitivamente' }))

    expect(await screen.findByText('La cuenta demo no se puede borrar.')).toBeInTheDocument()
  })

  it('deletes the account, forgets what the phone kept and goes to the login page', async () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ exercises: [] }))
    let signedIn = true
    const calls = mockApi({
      'GET /auth/me': () => (signedIn ? { body: USER } : { status: 401 }),
      'DELETE /auth/me': () => {
        signedIn = false
        return { status: 204 }
      },
    })
    const { user, router } = renderRoute('/cuenta')

    await user.click(await screen.findByRole('button', { name: 'Borrar mi cuenta' }))
    await user.type(screen.getByLabelText(/contraseña/), 'mi-contraseña')
    await user.click(screen.getByRole('button', { name: 'Borrar definitivamente' }))

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(calls.find((call) => call.method === 'DELETE')?.body).toEqual({ password: 'mi-contraseña' })
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
  })
})
