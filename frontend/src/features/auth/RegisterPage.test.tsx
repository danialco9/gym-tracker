import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'

const SIGNED_OUT = { status: 401, body: { detail: 'Not authenticated' } }
const NEW_USER: User = {
  id: 2,
  email: 'nuevo@example.com',
  goal: null,
  nickname: null,
  show_in_ranking: true,
  created_at: '2026-09-15T12:00:00Z',
}

describe('RegisterPage', () => {
  it('is reachable from the login page and back', async () => {
    mockApi({ 'GET /auth/me': SIGNED_OUT })
    const { user } = renderRoute('/login')

    await user.click(await screen.findByRole('link', { name: 'Crear cuenta' }))
    expect(await screen.findByRole('heading', { name: 'Crea tu cuenta' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Inicia sesión' }))
    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument()
  })

  it('validates password length and confirmation before calling the API', async () => {
    const calls = mockApi({ 'GET /auth/me': SIGNED_OUT })
    const { user } = renderRoute('/registro')

    await user.type(await screen.findByLabelText('Email'), 'nuevo@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'corta')
    await user.type(screen.getByLabelText('Repite la contraseña'), 'distinta')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByText('La contraseña debe tener al menos 8 caracteres')).toBeInTheDocument()
    expect(screen.getByText('Las contraseñas no coinciden')).toBeInTheDocument()
    expect(calls.some((call) => call.path === '/auth/register')).toBe(false)
  })

  it('explains when the email is already registered', async () => {
    mockApi({
      'GET /auth/me': SIGNED_OUT,
      'POST /auth/register': { status: 409, body: { detail: 'An account with this email already exists' } },
    })
    const { user } = renderRoute('/registro')

    await user.type(await screen.findByLabelText('Email'), 'dani@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'a-strong-password')
    await user.type(screen.getByLabelText('Repite la contraseña'), 'a-strong-password')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByText('Ya existe una cuenta con ese email')).toBeInTheDocument()
  })

  it('asks to wait after too many sign-ups', async () => {
    mockApi({
      'GET /auth/me': SIGNED_OUT,
      'POST /auth/register': {
        status: 429,
        body: { detail: 'Too many attempts, try again later' },
        headers: { 'Retry-After': '3540' },
      },
    })
    const { user } = renderRoute('/registro')

    await user.type(await screen.findByLabelText('Email'), 'dani@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'a-strong-password')
    await user.type(screen.getByLabelText('Repite la contraseña'), 'a-strong-password')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByText('Demasiados intentos. Vuelve a probar en 59 minutos.')).toBeInTheDocument()
  })

  it('creates the account and opens the app', async () => {
    const calls = mockApi({
      'GET /auth/me': SIGNED_OUT,
      'POST /auth/register': { status: 201, body: NEW_USER },
      'GET /workouts?limit=5': { body: [] },
      'GET /routines': { body: [] },
    })
    const { user } = renderRoute('/registro')

    await user.type(await screen.findByLabelText('Email'), 'nuevo@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'a-strong-password')
    await user.type(screen.getByLabelText('Repite la contraseña'), 'a-strong-password')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('link', { name: /Empezar entreno/ })).toBeInTheDocument()
    expect(calls.find((call) => call.path === '/auth/register')?.body).toEqual({
      email: 'nuevo@example.com',
      password: 'a-strong-password',
    })
  })
})
