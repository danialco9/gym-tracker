import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ProgressOverview, Routine, User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: 'build_muscle',
  nickname: null,
  show_in_ranking: true,
  created_at: '2026-09-15T10:00:00Z',
}

const LEG_DAY: Routine = {
  id: 7,
  name: 'Pierna',
  description: null,
  created_at: '2026-09-15T10:00:00Z',
  exercises: [
    {
      id: 1,
      position: 1,
      sets: [1, 2, 3].map((setNumber) => ({
        set_number: setNumber,
        target_reps: 8,
        target_weight_kg: 60,
        target_rpe: null,
      })),
      exercise: {
        id: 11,
        slug: 'back-squat',
        name: 'Sentadilla con barra',
        muscle_group: 'quads',
        secondary_muscles: ['glutes'],
        equipment: 'barbell',
        is_custom: false,
      },
    },
    {
      id: 2,
      position: 2,
      sets: [1, 2].map((setNumber) => ({
        set_number: setNumber,
        target_reps: 12,
        target_weight_kg: 30,
        target_rpe: null,
      })),
      exercise: {
        id: 20,
        slug: 'lying-leg-curl',
        name: 'Curl femoral tumbado',
        muscle_group: 'hamstrings',
        secondary_muscles: [],
        equipment: 'machine',
        is_custom: false,
      },
    },
  ],
}

const OVERVIEW: ProgressOverview = {
  activity: {
    workouts_total: 8,
    workouts_last_7_days: 2,
    workouts_last_28_days: 8,
    last_workout_on: '2026-10-15',
  },
  recommendations: [
    {
      exercise_id: 11,
      exercise_name: 'Sentadilla con barra',
      action: 'increase_load',
      reason: 'targets_hit',
      increment_kg: 5,
      last_performed_on: '2026-10-15',
      last_sets: [1, 2, 3].map(() => ({ reps: 8, weight_kg: 60, rpe: 7 })),
      target_sets: [1, 2, 3].map(() => ({ reps: 8, weight_kg: 60 })),
      suggested_sets: [1, 2, 3].map(() => ({ reps: 8, weight_kg: 65 })),
    },
  ],
  personal_records: [],
  weekly_volume: [],
  volume_advice: [
    {
      muscle_group: 'hamstrings',
      average_hard_sets: 4,
      status: 'low',
      weeks: 4,
      min_hard_sets: 12,
      max_hard_sets: 20,
    },
    {
      muscle_group: 'chest',
      average_hard_sets: 2,
      status: 'low',
      weeks: 4,
      min_hard_sets: 12,
      max_hard_sets: 20,
    },
  ],
  body_weight: { entries: [], weekly_change_kg: null },
}

const GOAL_PLANS = [
  {
    goal: 'build_muscle',
    compound_reps: { min: 6, max: 10 },
    isolation_reps: { min: 8, max: 12 },
    rpe: { min: 8, max: 9 },
    rest_seconds: { min: 120, max: 180 },
    weekly_hard_sets: { min: 12, max: 20 },
  },
]

beforeEach(() => {
  window.localStorage.clear()
})

describe("Today's plan", () => {
  it('shows what to do with each exercise and starts with the suggested weights', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /routines': { body: [LEG_DAY] },
      'GET /progress/overview': { body: OVERVIEW },
      'GET /progress/goals': { body: GOAL_PLANS },
    })
    const { user } = renderRoute('/entrenar')

    await user.click(await screen.findByRole('button', { name: /Pierna/ }))

    expect(screen.getByRole('heading', { name: 'Pierna' })).toBeInTheDocument()
    expect(await screen.findByText('Ganar músculo · RPE 8–9 · descanso 2–3 min')).toBeInTheDocument()
    const exercises = screen.getByRole('list', { name: 'Ejercicios de hoy' })
    const squat = within(exercises).getByText('Sentadilla con barra').closest('li')!
    expect(within(squat).getByText('Sube el peso')).toBeInTheDocument()
    expect(within(squat).getByText('3 × 8 · 65 kg')).toBeInTheDocument()
    const curl = within(exercises).getByText('Curl femoral tumbado').closest('li')!
    expect(within(curl).getByText('Según tu rutina')).toBeInTheDocument()
    expect(within(curl).getByText('2 × 12 · 30 kg')).toBeInTheDocument()
    // Only the muscles this routine trains.
    expect(screen.getByText('Isquiotibiales:')).toBeInTheDocument()
    expect(screen.queryByText('Pecho:')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Empezar con este plan' }))

    const weights = await screen.findAllByRole('textbox', { name: 'Peso (kg)' })
    // The squat takes the suggestion; the curl, with none, keeps the routine's plan.
    expect(weights.map((input) => (input as HTMLInputElement).value)).toEqual(['65', '30'])
  })

  it('goes back to the routines', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /routines': { body: [LEG_DAY] },
      'GET /progress/overview': { body: OVERVIEW },
      'GET /progress/goals': { body: GOAL_PLANS },
    })
    const { user } = renderRoute('/entrenar')

    await user.click(await screen.findByRole('button', { name: /Pierna/ }))
    await user.click(screen.getByRole('button', { name: 'Volver' }))

    expect(screen.getByRole('heading', { name: 'Nuevo entreno' })).toBeInTheDocument()
  })

  it('still starts with the routine when the plan cannot be prepared', async () => {
    mockApi({
      'GET /auth/me': { body: { ...USER, goal: null } },
      'GET /routines': { body: [LEG_DAY] },
      'GET /progress/overview': { status: 500 },
      'GET /progress/goals': { body: GOAL_PLANS },
    })
    const { user } = renderRoute('/entrenar')

    await user.click(await screen.findByRole('button', { name: /Pierna/ }))

    expect(await screen.findByText(/No se pudo preparar el plan/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Elige tu objetivo/ })).toHaveAttribute('href', '/objetivo')

    await user.click(screen.getByRole('button', { name: 'Empezar con este plan' }))

    const weights = await screen.findAllByRole('textbox', { name: 'Peso (kg)' })
    expect(weights.map((input) => (input as HTMLInputElement).value)).toEqual(['60', '30'])
  })
})
