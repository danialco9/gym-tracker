import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'
import { DRAFT_STORAGE_KEY, type WorkoutDraft } from './draft'

const USER: User = { id: 1, email: 'dani@example.com', goal: null, created_at: '2026-09-15T10:00:00Z' }

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

const set = (id: string, weightKg: number) => ({
  id,
  reps: 8,
  weightKg,
  rpe: null,
  isWarmup: false,
  done: false,
})

/** Two squat sets, then one bench press set. */
const DRAFT: WorkoutDraft = {
  clientId: '8f14e45f-ceea-467a-9575-0e1f3c9b7a01',
  routineId: null,
  routineName: 'Fuerza',
  startedAt: '2026-09-15T16:00:00.000Z',
  notes: '',
  exercises: [
    {
      id: 'squat',
      exerciseId: 11,
      name: 'Sentadilla con barra',
      targets: [],
      sets: [set('s1', 100), set('s2', 100)],
    },
    { id: 'bench', exerciseId: 6, name: 'Press banca con barra', targets: [], sets: [set('b1', 80)] },
  ],
}

// Only the records matter here: the best squat so far is 77.5 kg x 8 (98.2 kg estimated).
const OVERVIEW = {
  personal_records: [{ exercise_id: 11, best_e1rm_kg: 98.2 }],
}

function startWith(user: User) {
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(DRAFT))
  mockApi({
    'GET /auth/me': { body: user },
    'GET /progress/goals': { body: GOAL_PLANS },
    'GET /progress/overview': { body: OVERVIEW },
  })
  return renderRoute('/entrenar')
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('Exercise progress', () => {
  it('rings the sets done of each exercise', async () => {
    const { user } = startWith(USER)

    expect(await screen.findByText('0/2')).toBeInTheDocument()
    expect(screen.getByText('0/1')).toBeInTheDocument()

    await user.click((await screen.findAllByRole('button', { name: 'Completar serie 1' }))[0])

    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('says when the set about to be done beats the record, as the numbers change', async () => {
    const { user } = startWith(USER)

    // 100 kg x 8 on the squat beats it; the bench press has no history, so no record to beat.
    expect(await screen.findByText('Con 8 reps a 100 kg haces récord personal')).toBeInTheDocument()
    expect(screen.getAllByText(/haces récord personal/)).toHaveLength(1)

    const [squatWeight] = screen.getAllByRole('textbox', { name: 'Peso (kg)' })
    await user.clear(squatWeight)
    await user.type(squatWeight, '70')

    expect(screen.queryByText(/haces récord personal/)).not.toBeInTheDocument()
  })
})

describe('Rest between sets', () => {
  it('takes the screen with the countdown and the next set, until the user is ready', async () => {
    const { user } = startWith(USER)

    await user.click((await screen.findAllByRole('button', { name: 'Completar serie 1' }))[0])

    const rest = screen.getByRole('dialog', { name: 'Descanso' })
    expect(within(rest).getByRole('timer')).toHaveTextContent('1:30')
    expect(within(rest).getByText('Sentadilla con barra · serie 2')).toBeInTheDocument()
    expect(within(rest).getByText('8 × 100 kg')).toBeInTheDocument()

    await user.click(within(rest).getByRole('button', { name: 'Añadir 30 segundos' }))
    expect(within(rest).getByRole('timer')).toHaveTextContent('2:00')
    await user.click(within(rest).getByRole('button', { name: 'Quitar 15 segundos' }))
    expect(within(rest).getByRole('timer')).toHaveTextContent('1:45')

    await user.click(within(rest).getByRole('button', { name: 'Ya estoy listo' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it("lasts the goal's rest and announces the next exercise", async () => {
    const { user } = startWith({ ...USER, goal: 'build_muscle' })

    await user.click((await screen.findAllByRole('button', { name: 'Completar serie 1' }))[0])
    await user.click(screen.getByRole('button', { name: 'Ya estoy listo' }))
    await user.click(screen.getByRole('button', { name: 'Completar serie 2' }))

    const rest = screen.getByRole('dialog', { name: 'Descanso' })
    expect(within(rest).getByRole('timer')).toHaveTextContent('2:00')
    expect(within(rest).getByText('Press banca con barra · serie 1')).toBeInTheDocument()
  })

  it('does not start after the last set of the workout', async () => {
    const { user } = startWith(USER)

    await user.click((await screen.findAllByRole('button', { name: 'Completar serie 1' }))[0])
    await user.click(screen.getByRole('button', { name: 'Ya estoy listo' }))
    await user.click(screen.getByRole('button', { name: 'Completar serie 2' }))
    await user.click(screen.getByRole('button', { name: 'Ya estoy listo' }))
    await user.click(screen.getByRole('button', { name: 'Completar serie 1' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Terminar y guardar' })).toBeEnabled()
  })
})
