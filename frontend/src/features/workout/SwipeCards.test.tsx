import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Exercise, User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'
import { DRAFT_STORAGE_KEY, type WorkoutDraft } from './draft'

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  show_in_ranking: true,
  created_at: '2026-09-15T10:00:00Z',
}

const SQUAT: Exercise = {
  id: 11,
  slug: 'back-squat',
  name: 'Sentadilla con barra',
  muscle_group: 'quads',
  secondary_muscles: ['glutes'],
  equipment: 'barbell',
  is_custom: false,
}

const set = (id: string) => ({ id, reps: 8, weightKg: 60, rpe: null, isWarmup: false, done: false })

/** One squat set, then two bench press sets. */
const DRAFT: WorkoutDraft = {
  clientId: '8f14e45f-ceea-467a-9575-0e1f3c9b7a01',
  routineId: null,
  routineName: 'Fuerza',
  startedAt: '2026-09-15T16:00:00.000Z',
  notes: '',
  exercises: [
    { id: 'squat', exerciseId: 11, name: 'Sentadilla con barra', targets: [], sets: [set('s1')] },
    { id: 'bench', exerciseId: 6, name: 'Press banca con barra', targets: [], sets: [set('b1'), set('b2')] },
  ],
}

function startWith(draft: WorkoutDraft) {
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
  mockApi({
    'GET /auth/me': { body: USER },
    'GET /exercises': { body: [SQUAT] },
  })
  return renderRoute('/entrenar')
}

const currentExercise = () =>
  within(screen.getByRole('navigation', { name: 'Ejercicios' }))
    .getAllByRole('button')
    .find((dot) => dot.getAttribute('aria-current') === 'step')

beforeEach(() => {
  window.localStorage.clear()
})

describe('Swipeable exercise cards', () => {
  it('puts each exercise on its own slide, with a dot to jump to it', async () => {
    const { user } = startWith(DRAFT)

    expect(await screen.findByRole('region', { name: 'Ejercicio 1 de 2' })).toHaveTextContent(
      'Sentadilla con barra',
    )
    expect(screen.getByRole('region', { name: 'Ejercicio 2 de 2' })).toHaveTextContent(
      'Press banca con barra',
    )
    expect(currentExercise()).toHaveAccessibleName('Ir a Sentadilla con barra')

    await user.click(screen.getByRole('button', { name: 'Ir a Press banca con barra' }))

    expect(currentExercise()).toHaveAccessibleName('Ir a Press banca con barra')
  })

  it('slides on to the next exercise once the last set of one is done', async () => {
    const { user } = startWith(DRAFT)

    const squat = await screen.findByRole('region', { name: 'Ejercicio 1 de 2' })
    await user.click(within(squat).getByRole('button', { name: 'Completar serie 1' }))

    expect(currentExercise()).toHaveAccessibleName('Ir a Press banca con barra')
  })

  it('fills the progress bar with the sets done out of all planned', async () => {
    const { user } = startWith(DRAFT)

    const progress = await screen.findByRole('progressbar', { name: 'Progreso del entreno' })
    expect(progress).toHaveAttribute('aria-valuenow', '0')
    expect(progress).toHaveAttribute('aria-valuemax', '3')

    const squat = screen.getByRole('region', { name: 'Ejercicio 1 de 2' })
    await user.click(within(squat).getByRole('button', { name: 'Completar serie 1' }))

    expect(progress).toHaveAttribute('aria-valuenow', '1')
  })

  it('shows the drawing of catalog exercises', async () => {
    startWith(DRAFT)

    const squat = await screen.findByRole('region', { name: 'Ejercicio 1 de 2' })
    // Decorative (the name is next to it), so it is looked up by its source.
    await expect.poll(() => squat.querySelector('img')?.getAttribute('src')).toMatch(/^\/exercise-art\//)
  })
})
