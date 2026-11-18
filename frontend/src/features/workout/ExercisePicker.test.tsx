import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Exercise, Workout } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { ExercisePicker } from './ExercisePicker'

function exercise(id: number, slug: string, name: string, extra: Partial<Exercise> = {}): Exercise {
  return {
    id,
    slug,
    name,
    muscle_group: 'chest',
    secondary_muscles: [],
    equipment: 'barbell',
    is_custom: false,
    is_compound: false,
    ...extra,
  }
}

const BENCH = exercise(1, 'bench-press', 'Press banca con barra')
const FLY = exercise(2, 'dumbbell-fly', 'Aperturas con mancuernas', { equipment: 'dumbbell' })
const LEG_PRESS = exercise(3, 'leg-press', 'Prensa de piernas', {
  muscle_group: 'quads',
  equipment: 'machine',
})
const CUSTOM = exercise(4, 'bench-press', 'Mi press raro', { is_custom: true })

const LAST_WORKOUT: Workout = {
  id: 7,
  routine_id: null,
  started_at: '2026-09-28T10:00:00Z',
  ended_at: null,
  notes: null,
  sets: [{ id: 1, exercise_id: 3, set_number: 1, reps: 10, weight_kg: 100, rpe: null, is_warmup: false }],
}

function renderPicker(workouts: Workout[] = [], handlers: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    'GET /exercises': { body: [BENCH, FLY, LEG_PRESS, CUSTOM] },
    'GET /workouts?limit=5': { body: workouts },
    ...handlers,
  })
  const onSelect = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ExercisePicker open onOpenChange={() => {}} onSelect={onSelect} />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), onSelect, calls }
}

const section = (name: string) => screen.getByRole('region', { name })
/** The exercise names listed in a section, one per row. */
const rows = (region: HTMLElement) =>
  within(region)
    .getAllByRole('listitem')
    .map((row) => row.querySelector('.font-medium')?.textContent)

describe('ExercisePicker', () => {
  it('shows recent exercises above the full list', async () => {
    renderPicker([LAST_WORKOUT])

    const recent = await screen.findByRole('region', { name: 'Recientes' })
    expect(rows(recent)).toEqual(['Prensa de piernas'])
    expect(rows(section('Todos los ejercicios'))).toHaveLength(4)
  })

  it('filters by muscle and equipment, and the buttons show the choice', async () => {
    const { user } = renderPicker()
    await screen.findByRole('region', { name: 'Todos los ejercicios' })

    await user.click(screen.getByRole('button', { name: 'Músculos' }))
    await user.click(
      within(screen.getByRole('group', { name: 'Filtrar por músculo' })).getByRole('button', {
        name: 'Pecho',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Equipamiento' }))
    await user.click(
      within(screen.getByRole('group', { name: 'Filtrar por equipamiento' })).getByRole('button', {
        name: 'Mancuernas',
      }),
    )

    expect(screen.getByRole('button', { name: 'Pecho' })).toHaveAttribute('aria-expanded', 'false')
    expect(rows(section('1 ejercicio'))).toEqual(['Aperturas con mancuernas'])
  })

  it('hides the recents while searching and clears the search with one tap', async () => {
    const { user } = renderPicker([LAST_WORKOUT])
    await screen.findByRole('region', { name: 'Recientes' })

    await user.type(screen.getByRole('searchbox', { name: 'Buscar ejercicio' }), 'banca')

    expect(screen.queryByRole('region', { name: 'Recientes' })).not.toBeInTheDocument()
    expect(rows(section('1 ejercicio'))).toEqual(['Press banca con barra'])

    await user.click(screen.getByRole('button', { name: 'Borrar búsqueda' }))

    expect(screen.getByRole('searchbox', { name: 'Buscar ejercicio' })).toHaveValue('')
    expect(screen.getByRole('region', { name: 'Recientes' })).toBeInTheDocument()
  })

  it('draws catalog exercises and gives custom ones a generic icon', async () => {
    const { user, onSelect } = renderPicker()
    const all = await screen.findByRole('region', { name: 'Todos los ejercicios' })

    const bench = within(all).getByRole('button', { name: /Press banca con barra/ })
    expect(bench.querySelector('img')).toHaveAttribute('src', '/exercise-art/bench-press.webp')
    // Same slug as the catalog bench press, but it is the user's own exercise.
    expect(
      within(all)
        .getByRole('button', { name: /Mi press raro/ })
        .querySelector('img'),
    ).toBeNull()

    await user.click(bench)
    expect(onSelect).toHaveBeenCalledWith(BENCH)
  })

  it('opens an exercise sheet with the movement, the muscles and an add button', async () => {
    const { user, onSelect } = renderPicker()
    await screen.findByRole('region', { name: 'Todos los ejercicios' })

    await user.click(screen.getByRole('button', { name: 'Ver ficha', description: 'Press banca con barra' }))

    const sheet = await screen.findByRole('dialog', { name: 'Press banca con barra' })
    const frames = [
      ...within(sheet).getByRole('img', { name: 'Dibujo del movimiento' }).querySelectorAll('img'),
    ]
    expect(frames.map((frame) => frame.getAttribute('src'))).toEqual([
      '/exercise-art/frames/bench-press-1.webp',
      '/exercise-art/frames/bench-press-2.webp',
      '/exercise-art/frames/bench-press-3.webp',
    ])
    expect(within(sheet).getByText('Pecho')).toBeInTheDocument()
    expect(within(sheet).getByText('Barra')).toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'Añadir' }))
    expect(onSelect).toHaveBeenCalledWith(BENCH)
  })

  it('says so when an exercise has no drawing', async () => {
    const { user } = renderPicker()
    await screen.findByRole('region', { name: 'Todos los ejercicios' })

    await user.click(screen.getByRole('button', { name: 'Ver ficha', description: 'Mi press raro' }))

    const sheet = await screen.findByRole('dialog', { name: 'Mi press raro' })
    expect(within(sheet).getByText('Este ejercicio no tiene dibujo.')).toBeInTheDocument()
    expect(within(sheet).queryByRole('img', { name: 'Dibujo del movimiento' })).not.toBeInTheDocument()
  })

  it('creates the exercise that a search did not find and adds it straight away', async () => {
    const created = exercise(9, 'remo-hammer', 'Remo Hammer', {
      muscle_group: 'back',
      equipment: 'machine',
      is_custom: true,
      is_compound: false,
    })
    const { user, onSelect, calls } = renderPicker([], { 'POST /exercises': { status: 201, body: created } })
    await screen.findByRole('region', { name: 'Todos los ejercicios' })

    await user.type(screen.getByRole('searchbox', { name: 'Buscar ejercicio' }), 'Remo Hammer ')
    await user.click(screen.getByRole('button', { name: 'Crear «Remo Hammer»' }))

    const form = await screen.findByRole('dialog', { name: 'Crear ejercicio' })
    expect(within(form).getByLabelText('Nombre')).toHaveValue('Remo Hammer')
    // Nothing to create until the main muscle is chosen.
    expect(within(form).getByRole('button', { name: 'Elige el músculo principal' })).toBeDisabled()

    const muscles = within(form).getByRole('group', { name: 'Músculo principal' })
    await user.click(within(muscles).getByRole('button', { name: 'Espalda' }))
    const equipment = within(form).getByRole('group', { name: 'Material' })
    await user.click(within(equipment).getByRole('button', { name: 'Máquina' }))
    await user.click(within(form).getByRole('button', { name: 'Crear y añadir' }))

    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledWith(created))
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      name: 'Remo Hammer',
      muscle_group: 'back',
      equipment: 'machine',
    })
  })

  it('explains when the user already has an exercise with that name', async () => {
    const { user, onSelect } = renderPicker([], {
      'POST /exercises': { status: 409, body: { detail: 'An exercise with this slug already exists' } },
    })
    await screen.findByRole('region', { name: 'Todos los ejercicios' })

    await user.click(screen.getByRole('button', { name: 'Crear ejercicio' }))
    const form = await screen.findByRole('dialog', { name: 'Crear ejercicio' })
    await user.type(within(form).getByLabelText('Nombre'), 'Mi press raro')
    await user.click(
      within(within(form).getByRole('group', { name: 'Músculo principal' })).getByRole('button', {
        name: 'Pecho',
      }),
    )
    await user.click(within(form).getByRole('button', { name: 'Crear y añadir' }))

    expect(await within(form).findByText(/Ya tienes un ejercicio con ese nombre/)).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
