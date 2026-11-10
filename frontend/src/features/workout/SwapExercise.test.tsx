import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Exercise, User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'
import { DRAFT_STORAGE_KEY, loadDraft, type WorkoutDraft } from './draft'

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  sex: null,
  created_at: '2026-09-15T10:00:00Z',
}

const exercise = (
  id: number,
  name: string,
  muscle_group: Exercise['muscle_group'],
  equipment: Exercise['equipment'],
  secondary_muscles: Exercise['secondary_muscles'] = [],
): Exercise => ({
  id,
  slug: `exercise-${id}`,
  name,
  muscle_group,
  secondary_muscles,
  equipment,
  is_custom: false,
})

const CATALOG = [
  exercise(11, 'Sentadilla con barra', 'quads', 'barbell', ['glutes']),
  exercise(12, 'Sentadilla en Smith', 'quads', 'smith_machine', ['glutes']),
  exercise(5, 'Prensa de piernas', 'quads', 'machine', ['glutes']),
  exercise(6, 'Press banca con barra', 'chest', 'barbell', ['triceps']),
]

/** A routine workout on its squats, the first set already done when ``doneSets`` says so. */
function seedDraft(doneSets = 0) {
  const draft: WorkoutDraft = {
    clientId: 'draft-1',
    routineId: 7,
    routineName: 'Pierna',
    startedAt: '2026-09-15T16:00:00.000Z',
    notes: '',
    exercises: [
      {
        id: 'squat',
        exerciseId: 11,
        name: 'Sentadilla con barra',
        targets: Array(3).fill({ reps: 8, weightKg: 100 }),
        sets: [1, 2, 3].map((number) => ({
          id: `set-${number}`,
          reps: 8,
          weightKg: 100,
          rpe: null,
          isWarmup: false,
          done: number <= doneSets,
        })),
      },
    ],
  }
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
}

const LEG_PRESS_LAST_TIME = {
  workout_id: 3,
  started_at: '2026-09-08T16:00:00Z',
  sets: [
    { id: 1, exercise_id: 5, set_number: 1, reps: 12, weight_kg: 60, rpe: null, is_warmup: true },
    { id: 2, exercise_id: 5, set_number: 2, reps: 10, weight_kg: 150, rpe: null, is_warmup: false },
  ],
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('Swapping an exercise', () => {
  it('offers the same muscle and takes its place with the weight of last time', async () => {
    seedDraft()
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /exercises': { body: CATALOG },
      'GET /exercises/5/last-session': { body: LEG_PRESS_LAST_TIME },
    })
    const { user } = renderRoute('/entrenar')

    await user.click(await screen.findByRole('button', { name: 'Cambiar ejercicio Sentadilla con barra' }))

    const sheet = await screen.findByRole('dialog', { name: 'Cambiar Sentadilla con barra por…' })
    const options = within(sheet).getAllByRole('button', { name: /Prensa|Sentadilla|Press/ })
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('Prensa de piernas'),
      expect.stringContaining('Sentadilla en Smith'),
    ])
    await user.click(within(sheet).getByRole('button', { name: /Prensa de piernas/ }))

    expect(
      await screen.findByRole('button', { name: 'Cambiar ejercicio Prensa de piernas' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Objetivo: 3 × 8')).toBeInTheDocument()
    // The working set of last time, not its warm-up.
    expect(screen.getByRole('textbox', { name: 'Peso (kg)' })).toHaveValue('150')
    expect(loadDraft()?.exercises.map((entry) => [entry.exerciseId, entry.sets.length])).toEqual([[5, 3]])
  })

  it('keeps the sets done and looks through the whole catalog when no alternative will do', async () => {
    seedDraft(1)
    mockApi({ 'GET /auth/me': { body: USER }, 'GET /exercises': { body: CATALOG } })
    const { user } = renderRoute('/entrenar')

    await user.click(await screen.findByRole('button', { name: 'Cambiar ejercicio Sentadilla con barra' }))
    await user.click(await screen.findByRole('button', { name: 'Buscar otro ejercicio' }))
    await user.type(await screen.findByRole('searchbox', { name: 'Buscar ejercicio' }), 'banca')
    await user.click(screen.getByRole('button', { name: /Press banca con barra/ }))

    expect(
      await screen.findByRole('button', { name: 'Cambiar ejercicio Press banca con barra' }),
    ).toBeInTheDocument()
    // Never done before: its sets start without a weight rather than with the squat's.
    expect(
      loadDraft()?.exercises.map((entry) => [entry.name, entry.sets.map((set) => set.weightKg)]),
    ).toEqual([
      ['Sentadilla con barra', [100]],
      ['Press banca con barra', [0, 0]],
    ])
  })
})
