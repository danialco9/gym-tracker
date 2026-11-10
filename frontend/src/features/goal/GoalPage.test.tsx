import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { GoalPlan, User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  sex: null,
  show_in_ranking: true,
  created_at: '2026-09-15T10:00:00Z',
}

const PLANS: GoalPlan[] = [
  {
    goal: 'lose_fat',
    compound_reps: { min: 6, max: 10 },
    isolation_reps: { min: 10, max: 15 },
    rpe: { min: 7, max: 8 },
    rest_seconds: { min: 60, max: 90 },
    weekly_hard_sets: { min: 10, max: 14 },
  },
  {
    goal: 'build_muscle',
    compound_reps: { min: 8, max: 12 },
    isolation_reps: { min: 10, max: 15 },
    rpe: { min: 8, max: 9 },
    rest_seconds: { min: 120, max: 180 },
    weekly_hard_sets: { min: 12, max: 20 },
  },
  {
    goal: 'build_strength',
    compound_reps: { min: 6, max: 8 },
    isolation_reps: { min: 8, max: 12 },
    rpe: { min: 8, max: 9 },
    rest_seconds: { min: 180, max: 300 },
    weekly_hard_sets: { min: 10, max: 16 },
  },
  {
    goal: 'recomposition',
    compound_reps: { min: 4, max: 8 },
    isolation_reps: { min: 10, max: 15 },
    rpe: { min: 7.5, max: 8.5 },
    rest_seconds: { min: 90, max: 150 },
    weekly_hard_sets: { min: 10, max: 16 },
  },
]

const HOME = {
  'GET /routines': { body: [] },
  'GET /workouts?limit=5': { body: [] },
  'GET /progress/goals': { body: PLANS },
}

describe('Goal', () => {
  it('is offered on the home screen until one is chosen', async () => {
    const calls = mockApi({
      ...HOME,
      'GET /auth/me': { body: USER },
      'PATCH /auth/me': ({ body }) => ({ body: { ...USER, ...(body as object) } }),
    })
    const { user, router } = renderRoute('/')

    await user.click(await screen.findByRole('link', { name: /Elige tu objetivo/ }))
    expect(screen.getByRole('button', { name: 'Guardar objetivo' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Ganar músculo/ }))

    expect(screen.getByRole('button', { name: /Ganar músculo/ })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('12–20')).toBeInTheDocument()
    expect(screen.getByText('RIR 1–2')).toBeInTheDocument()
    expect(screen.getByText('2–3 min')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Guardar objetivo' }))

    expect(await screen.findByRole('heading', { name: /^Hola/ })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.queryByRole('link', { name: /Elige tu objetivo/ })).not.toBeInTheDocument()
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ goal: 'build_muscle' })
  })

  it('starts on the current goal and only saves a different one', async () => {
    mockApi({ ...HOME, 'GET /auth/me': { body: { ...USER, goal: 'recomposition' } } })
    const { user } = renderRoute('/objetivo')

    const current = await screen.findByRole('button', { name: /Recomposición/ })
    expect(current).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('RIR 1,5–2,5')).toBeInTheDocument()
    expect(screen.getByText('90–150 s')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar objetivo' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /Bajar grasa/ }))

    expect(current).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('60–90 s')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar objetivo' })).toBeEnabled()
  })

  it('offers strength, with fewer repetitions and longer rests than muscle', async () => {
    const calls = mockApi({
      ...HOME,
      'GET /auth/me': { body: { ...USER, goal: 'build_muscle' } },
      'PATCH /auth/me': ({ body }) => ({ body: { ...USER, ...(body as object) } }),
    })
    const { user } = renderRoute('/objetivo')

    expect(await screen.findByText('10–15 en aislamiento')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Ganar fuerza/ }))

    expect(screen.getByText('6–8')).toBeInTheDocument()
    expect(screen.getByText('8–12 en aislamiento')).toBeInTheDocument()
    expect(screen.getByText('3–5 min')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Guardar objetivo' }))

    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ goal: 'build_strength' }),
    )
  })

  it('saves training blocks with the goal, sending only what changed', async () => {
    const calls = mockApi({
      ...HOME,
      'GET /auth/me': { body: { ...USER, goal: 'build_muscle' } },
      'PATCH /auth/me': ({ body }) => ({
        body: {
          ...USER,
          goal: 'build_muscle',
          ...(body as object),
          block: { week: 1, weeks: 5, is_deload: false },
        },
      }),
    })
    const { user, router } = renderRoute('/objetivo')

    expect(await screen.findByRole('button', { name: 'Sin bloques' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Entrenas igual todas las semanas.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bloques de 5 semanas' }))
    expect(screen.getByText(/4 semanas apretando y 1 de descarga/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar objetivo' }))

    expect(await screen.findByRole('region', { name: 'Tu bloque' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ block_weeks: 5 })
  })

  it('starts a running block again this week', async () => {
    const calls = mockApi({
      ...HOME,
      'GET /auth/me': {
        body: {
          ...USER,
          goal: 'build_muscle',
          block_weeks: 4,
          block: { week: 3, weeks: 4, is_deload: false },
        },
      },
      'PATCH /auth/me': {
        body: {
          ...USER,
          goal: 'build_muscle',
          block_weeks: 4,
          block: { week: 1, weeks: 4, is_deload: false },
        },
      },
    })
    const { user } = renderRoute('/objetivo')

    expect(await screen.findByRole('button', { name: 'Bloques de 4 semanas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Guardar objetivo' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Empezar el bloque de nuevo esta semana' }))

    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ block_weeks: 4 }),
    )
  })

  it('says so when the goal cannot be saved', async () => {
    mockApi({ ...HOME, 'GET /auth/me': { body: USER }, 'PATCH /auth/me': { status: 500 } })
    const { user, router } = renderRoute('/objetivo')

    await user.click(await screen.findByRole('button', { name: /Bajar grasa/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar objetivo' }))

    expect(await screen.findByText('No se pudo guardar. Prueba otra vez en un rato.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/objetivo')
  })

  it('shows the chosen goal in the account', async () => {
    mockApi({ 'GET /auth/me': { body: { ...USER, goal: 'lose_fat' } } })
    renderRoute('/cuenta')

    expect(await screen.findByRole('link', { name: /Objetivo\s*Bajar grasa/ })).toHaveAttribute(
      'href',
      '/objetivo',
    )
  })
})
