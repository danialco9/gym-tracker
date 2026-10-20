import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Exercise, Routine, User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'

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

const SQUAT: Exercise = {
  id: 11,
  slug: 'back-squat',
  name: 'Sentadilla con barra',
  muscle_group: 'quads',
  secondary_muscles: ['glutes'],
  equipment: 'barbell',
  is_custom: false,
}

function legDay(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 7,
    name: 'Pierna',
    description: 'Miércoles',
    created_at: '2026-09-15T10:00:00Z',
    exercises: [
      {
        id: 1,
        position: 1,
        exercise: SQUAT,
        sets: [
          { set_number: 1, target_reps: 10, target_weight_kg: 60, target_rpe: null },
          { set_number: 2, target_reps: 8, target_weight_kg: 70, target_rpe: 8 },
        ],
      },
    ],
    ...overrides,
  }
}

async function addExercise(user: UserEvent, search: string, name: string) {
  await user.click(screen.getByRole('button', { name: /Añadir ejercicio/ }))
  const searchbox = await screen.findByRole('searchbox', { name: 'Buscar ejercicio' })
  await user.clear(searchbox)
  await user.type(searchbox, search)
  await user.click(screen.getByRole('button', { name: new RegExp(name) }))
}

describe('Routines', () => {
  // The longest flow in the suite (two exercises, a set plan each, a drag): about 5 s on a slow
  // laptop, right at the default limit, so it gets room of its own.
  it('creates a routine with ordered exercises and a plan for each set', async () => {
    let routines: Routine[] = []
    const calls = mockApi({
      'GET /auth/me': { body: USER },
      'GET /routines': () => ({ body: routines }),
      'GET /exercises': { body: [LEG_PRESS, SQUAT] },
      'POST /routines': () => {
        routines = [legDay()]
        return { status: 201, body: routines[0] }
      },
    })
    const { user } = renderRoute('/rutinas')

    await user.click(await screen.findByRole('link', { name: /Nueva rutina/ }))
    await user.type(await screen.findByLabelText('Nombre'), 'Pierna')
    await addExercise(user, 'prensa', 'Prensa de piernas')
    await addExercise(user, 'sentadilla', 'Sentadilla con barra')

    // Move the squat to the top with the keyboard: pick up, move up, drop.
    screen.getByRole('button', { name: 'Mover Sentadilla con barra' }).focus()
    await user.keyboard('[Space]')
    await user.keyboard('[ArrowUp]')
    await user.keyboard('[Space]')

    const [squat, press] = screen.getAllByRole('listitem').filter((item) => item.querySelector('ol'))
    expect(squat).toHaveTextContent('Sentadilla con barra')
    expect(press).toHaveTextContent('Prensa de piernas')

    // Squat: a ramp of 10 × 60, 8 × 70 and 6 × 80.
    const squatCard = within(squat)
    await user.click(squatCard.getByRole('button', { name: 'Quitar serie 3 de Sentadilla con barra' }))
    await user.click(squatCard.getByRole('button', { name: 'Quitar serie 2 de Sentadilla con barra' }))
    await user.type(squatCard.getByLabelText('Serie 1: Reps'), '10')
    await user.type(squatCard.getByLabelText('Serie 1: Peso (kg)'), '60')
    await user.click(squatCard.getByRole('button', { name: 'Añadir serie' }))
    expect(squatCard.getByLabelText('Serie 2: Peso (kg)')).toHaveValue('60')
    await user.clear(squatCard.getByLabelText('Serie 2: Reps'))
    await user.type(squatCard.getByLabelText('Serie 2: Reps'), '8')
    await user.clear(squatCard.getByLabelText('Serie 2: Peso (kg)'))
    await user.type(squatCard.getByLabelText('Serie 2: Peso (kg)'), '72,5')
    await user.click(squatCard.getByRole('button', { name: 'Añadir serie' }))
    await user.clear(squatCard.getByLabelText('Serie 3: Reps'))
    await user.type(squatCard.getByLabelText('Serie 3: Reps'), '6')
    await user.type(squatCard.getByLabelText('Serie 3: RPE'), '9')

    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))

    expect(await screen.findByRole('link', { name: /Pierna/ })).toBeInTheDocument()
    const emptySet = { target_reps: null, target_weight_kg: null, target_rpe: null }
    expect(calls.find((call) => call.method === 'POST' && call.path === '/routines')?.body).toEqual({
      name: 'Pierna',
      description: null,
      exercises: [
        {
          exercise_id: 11,
          sets: [
            { target_reps: 10, target_weight_kg: 60, target_rpe: null },
            { target_reps: 8, target_weight_kg: 72.5, target_rpe: null },
            { target_reps: 6, target_weight_kg: 72.5, target_rpe: 9 },
          ],
        },
        { exercise_id: 5, sets: [emptySet, emptySet, emptySet] },
      ],
    })
  }, 15_000)

  it('edits and deletes an existing routine', async () => {
    let routines: Routine[] = [legDay()]
    const calls = mockApi({
      'GET /auth/me': { body: USER },
      'GET /routines': () => ({ body: routines }),
      'GET /exercises': { body: [SQUAT] },
      'PUT /routines/7': () => {
        routines = [legDay({ name: 'Pierna A' })]
        return { body: routines[0] }
      },
      'DELETE /routines/7': () => {
        routines = []
        return { status: 204 }
      },
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderRoute('/rutinas')

    await user.click(await screen.findByRole('link', { name: /Pierna/ }))
    const name = await screen.findByLabelText('Nombre')
    expect(name).toHaveValue('Pierna')
    expect(screen.getByLabelText('Serie 1: Peso (kg)')).toHaveValue('60')
    expect(screen.getByLabelText('Serie 2: RPE')).toHaveValue('8')
    await user.clear(name)
    await user.type(name, 'Pierna A')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))

    expect(await screen.findByRole('link', { name: /Pierna A/ })).toBeInTheDocument()
    expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({
      name: 'Pierna A',
      description: 'Miércoles',
      exercises: [
        {
          exercise_id: 11,
          sets: [
            { target_reps: 10, target_weight_kg: 60, target_rpe: null },
            { target_reps: 8, target_weight_kg: 70, target_rpe: 8 },
          ],
        },
      ],
    })

    await user.click(screen.getByRole('link', { name: /Pierna A/ }))
    await user.click(await screen.findByRole('button', { name: /Eliminar rutina/ }))

    expect(await screen.findByText(/Aún no tienes rutinas/)).toBeInTheDocument()
    expect(calls.some((call) => call.method === 'DELETE' && call.path === '/routines/7')).toBe(true)
  })

  it('validates the form and explains duplicate names', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /routines': { body: [] },
      'POST /routines': { status: 409, body: { detail: 'A routine with this name already exists' } },
    })
    const { user } = renderRoute('/rutinas/nueva')

    await user.click(await screen.findByRole('button', { name: 'Guardar rutina' }))
    expect(await screen.findByText('Ponle un nombre a la rutina')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nombre'), 'Pierna')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    expect(await screen.findByText('Ya tienes una rutina con ese nombre')).toBeInTheDocument()
  })
})
