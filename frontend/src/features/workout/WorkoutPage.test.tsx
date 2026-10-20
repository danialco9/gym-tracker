import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Exercise, User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'
import { DRAFT_STORAGE_KEY, type WorkoutDraft } from './draft'

const USER: User = { id: 1, email: 'dani@example.com', goal: null, created_at: '2026-09-15T10:00:00Z' }

const LEG_PRESS: Exercise = {
  id: 5,
  slug: 'leg-press',
  name: 'Prensa de piernas',
  muscle_group: 'quads',
  secondary_muscles: ['glutes'],
  equipment: 'machine',
  is_custom: false,
}

const BENCH_PRESS: Exercise = {
  id: 6,
  slug: 'bench-press',
  name: 'Press banca con barra',
  muscle_group: 'chest',
  secondary_muscles: ['triceps'],
  equipment: 'barbell',
  is_custom: false,
}

describe('WorkoutPage', () => {
  it('logs a free workout and saves only the completed sets', async () => {
    const calls = mockApi({
      'GET /auth/me': { body: USER },
      'GET /routines': { body: [] },
      'GET /exercises': { body: [LEG_PRESS, BENCH_PRESS] },
      'GET /exercises/5/last-session': {
        body: {
          workout_id: 3,
          started_at: '2026-09-08T16:00:00Z',
          sets: [
            { id: 1, exercise_id: 5, set_number: 1, reps: 12, weight_kg: 110, rpe: null, is_warmup: false },
          ],
        },
      },
      'POST /workouts': { status: 201, body: { id: 99 } },
      'GET /workouts?limit=5': { body: [] },
    })
    const { user } = renderRoute('/entrenar')

    await user.click(await screen.findByRole('button', { name: /Entreno libre/ }))
    await user.click(screen.getByRole('button', { name: /Añadir ejercicio/ }))
    await user.type(await screen.findByRole('searchbox', { name: 'Buscar ejercicio' }), 'prensa')
    await user.click(screen.getByRole('button', { name: /Prensa de piernas/ }))

    expect(await screen.findByText(/110 kg × 12/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Aumentar peso (kg)' }))
    await user.click(screen.getByRole('button', { name: 'Aumentar peso (kg)' }))
    await user.click(screen.getByRole('button', { name: /Añadir serie/ }))
    await user.click(screen.getByRole('button', { name: 'Completar serie 1' }))

    expect(screen.getByRole('timer')).toHaveTextContent(/Descanso/)

    await user.click(screen.getByRole('button', { name: 'Terminar y guardar' }))

    expect(await screen.findByRole('link', { name: /Empezar entreno/ })).toBeInTheDocument()
    expect(calls.find((call) => call.method === 'POST' && call.path === '/workouts')?.body).toMatchObject({
      routine_id: null,
      sets: [{ exercise_id: 5, set_number: 1, reps: 10, weight_kg: 5, rpe: null, is_warmup: false }],
    })
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('starts a workout from a dictation, after the user resolves what was not recognised', async () => {
    const calls = mockApi({
      'GET /auth/me': { body: USER },
      'GET /routines': { body: [] },
      'GET /exercises': { body: [LEG_PRESS, BENCH_PRESS] },
      'GET /exercises/5/last-session': { body: null },
      'GET /exercises/6/last-session': { body: null },
      'POST /dictation': {
        body: {
          exercises: [
            {
              query: 'prensa',
              name: 'Prensa de piernas',
              exercise_id: 5,
              sets: [
                { reps: 10, weight_kg: 120, rpe: null },
                { reps: 10, weight_kg: 120, rpe: null },
              ],
              suggestions: [],
            },
            {
              query: 'press banca',
              name: 'press banca',
              exercise_id: null,
              sets: [{ reps: 8, weight_kg: null, rpe: 8 }],
              suggestions: [{ id: 6, name: 'Press banca con barra' }],
            },
          ],
        },
      },
    })
    const { user } = renderRoute('/entrenar')

    await user.type(await screen.findByLabelText('Tu entreno'), 'prensa 4x10 120, press banca 8 rpe 8')
    await user.click(screen.getByRole('button', { name: 'Leer entreno' }))

    // What it understood is shown for review; nothing has been saved.
    expect(await screen.findByText('Prensa de piernas')).toBeInTheDocument()
    expect(screen.getByText('2 series · 10 reps · 120 kg')).toBeInTheDocument()
    expect(calls.some((call) => call.path === '/workouts')).toBe(false)

    // "press banca" fits more than one catalog entry, so it is offered instead of guessed at.
    await user.click(screen.getByRole('button', { name: 'Press banca con barra' }))

    await user.click(screen.getByRole('button', { name: 'Empezar con 2 ejercicios' }))

    // The workout opens prefilled: one open set per exercise, the rest waiting their turn.
    expect(await screen.findByRole('heading', { name: 'Entreno libre' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Completar serie 1' })).toHaveLength(2)
  })

  it('opens one set at a time and lets the previous one be corrected', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /routines': { body: [] },
      'GET /exercises': { body: [LEG_PRESS, BENCH_PRESS] },
      'GET /exercises/5/last-session': { body: null },
    })
    const { user } = renderRoute('/entrenar')

    await user.click(await screen.findByRole('button', { name: /Entreno libre/ }))
    await user.click(screen.getByRole('button', { name: /Añadir ejercicio/ }))
    await user.type(await screen.findByRole('searchbox', { name: 'Buscar ejercicio' }), 'prensa')
    await user.click(screen.getByRole('button', { name: /Prensa de piernas/ }))
    await user.click(await screen.findByRole('button', { name: /Añadir serie/ }))

    // Only the first set has controls; the second one waits its turn.
    expect(screen.getByRole('button', { name: 'Completar serie 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Completar serie 2' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Corregir la serie anterior' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'RPE 8' }))
    await user.click(screen.getByRole('button', { name: 'Completar serie 1' }))

    // Set 1 collapses to a summary line and set 2 takes over.
    expect(screen.getByRole('button', { name: 'Completar serie 2' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Corregir serie 1: 0 kg por 10 repeticiones' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Corregir la serie anterior' }))

    expect(screen.getByRole('button', { name: 'Completar serie 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'RPE 8' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('restores the draft saved on this device', async () => {
    const draft: WorkoutDraft = {
      clientId: 'draft-1',
      routineId: null,
      routineName: 'Pierna',
      startedAt: '2026-09-15T16:00:00.000Z',
      notes: '',
      exercises: [],
    }
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
    mockApi({ 'GET /auth/me': { body: USER } })

    renderRoute('/entrenar')

    expect(await screen.findByRole('heading', { name: 'Pierna' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Terminar y guardar' })).toBeDisabled()
  })
})

function draftWithDoneSet(): WorkoutDraft {
  return {
    clientId: '8f14e45f-ceea-467a-9575-0e1f3c9b7a01',
    routineId: null,
    routineName: null,
    startedAt: '2026-09-15T16:00:00.000Z',
    notes: '',
    exercises: [
      {
        id: 'entry-1',
        exerciseId: 5,
        name: 'Prensa de piernas',
        targets: [],
        sets: [{ id: 'set-1', reps: 12, weightKg: 110, rpe: null, isWarmup: false, done: true }],
      },
    ],
  }
}

describe('Session', () => {
  it('sends an expired session to the login and keeps the workout to save afterwards', async () => {
    let session: 'active' | 'expired' | 'renewed' = 'active'
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftWithDoneSet()))
    const calls = mockApi({
      'GET /auth/me': () => (session === 'expired' ? { status: 401 } : { body: USER }),
      'POST /workouts': () => {
        if (session === 'renewed') {
          return { status: 201, body: { id: 99 } }
        }
        session = 'expired'
        return { status: 401, body: { detail: 'Not authenticated' } }
      },
      'POST /auth/login': () => {
        session = 'renewed'
        return { status: 204 }
      },
      'GET /workouts?limit=5': { body: [] },
    })
    const { user, router } = renderRoute('/entrenar')

    await user.click(await screen.findByRole('button', { name: 'Terminar y guardar' }))

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull()

    await user.type(screen.getByLabelText('Email'), 'dani@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    await user.click(await screen.findByRole('button', { name: 'Terminar y guardar' }))

    expect(await screen.findByRole('link', { name: /Empezar entreno/ })).toBeInTheDocument()
    expect(calls.filter((call) => call.method === 'POST' && call.path === '/workouts')).toHaveLength(2)
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('asks before signing out with a workout in progress and then discards it', async () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftWithDoneSet()))
    let signedIn = true
    const calls = mockApi({
      'GET /auth/me': () => (signedIn ? { body: USER } : { status: 401 }),
      'POST /auth/logout': () => {
        signedIn = false
        return { status: 204 }
      },
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const { user, router } = renderRoute('/entrenar')

    await user.click(await screen.findByRole('link', { name: 'Cuenta' }))
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(calls.some((call) => call.path === '/auth/logout')).toBe(false)
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
  })
})
