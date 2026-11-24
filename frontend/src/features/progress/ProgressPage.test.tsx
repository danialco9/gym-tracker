import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { formatLongDay } from '@/features/plan/week-dates'
import type { ExerciseProgress, Milestone, MuscleGroup, ProgressOverview, User, Workout } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'
import { addMonths, formatMonth, localDate, monthOf } from './calendar'

// Recharts needs real layout (ResizeObserver, element sizes), which jsdom does not provide.
vi.mock('./ProgressCharts', () => ({
  ExerciseChart: ({ sessions }: { sessions: unknown[] }) => <p>Gráfica de {sessions.length} sesiones</p>,
  VolumeChart: ({ series }: { series: string[] }) => <p>Volumen: {series.join(', ')}</p>,
  BodyWeightChart: ({ entries }: { entries: unknown[] }) => <p>Gráfica de {entries.length} pesajes</p>,
}))

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  sex: null,
  created_at: '2026-09-15T10:00:00Z',
}

const EMPTY_WEEKS = ['2026-08-31', '2026-09-07'].map((weekStart) => ({ week_start: weekStart, muscles: [] }))

const MAIN_MUSCLES: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
]

/** This week's sets of every main muscle: the ones given, zero for the rest. */
const weekSets = (done: Partial<Record<MuscleGroup, number>> = {}) =>
  MAIN_MUSCLES.map((muscle) => ({
    muscle_group: muscle,
    hard_sets: done[muscle] ?? 0,
    min_hard_sets: 10,
    max_hard_sets: 20,
    target_hard_sets: 10,
    last_week_hard_sets: 0,
  }))

const OVERVIEW: ProgressOverview = {
  activity: {
    workouts_total: 12,
    workouts_last_7_days: 3,
    workouts_last_28_days: 11,
    last_workout_on: '2026-09-15',
  },
  recommendations: [
    {
      exercise_id: 11,
      exercise_name: 'Sentadilla con barra',
      action: 'increase_load',
      reason: 'targets_hit',
      increment_kg: 5,
      last_performed_on: '2026-09-09',
      last_sets: Array.from({ length: 4 }, () => ({ reps: 8, weight_kg: 77.5, rpe: 8 })),
      target_sets: Array.from({ length: 4 }, () => ({ reps: 6, weight_kg: 80 })),
      suggested_sets: Array.from({ length: 4 }, () => ({ reps: 6, weight_kg: 80 })),
      rep_range: null,
    },
    {
      exercise_id: 1,
      exercise_name: 'Press banca con barra',
      action: 'increase_reps',
      reason: 'without_plan',
      increment_kg: 2.5,
      last_performed_on: '2026-09-15',
      last_sets: [6, 6, 4].map((reps) => ({ reps, weight_kg: 67.5, rpe: 9 })),
      target_sets: [],
      suggested_sets: [6, 6, 4].map((reps) => ({ reps, weight_kg: 67.5 })),
      rep_range: null,
    },
    {
      exercise_id: 5,
      exercise_name: 'Prensa de piernas',
      action: 'deload',
      reason: 'plateau',
      increment_kg: 5,
      last_performed_on: '2026-09-09',
      last_sets: [
        { reps: 14, weight_kg: 122.5, rpe: 8 },
        { reps: 12, weight_kg: 132.5, rpe: 8 },
        { reps: 9, weight_kg: 142.5, rpe: 9 },
      ],
      target_sets: [
        { reps: 12, weight_kg: 120 },
        { reps: 10, weight_kg: 130 },
        { reps: 8, weight_kg: 140 },
      ],
      suggested_sets: [
        { reps: 12, weight_kg: 110 },
        { reps: 10, weight_kg: 117.5 },
        { reps: 8, weight_kg: 127.5 },
      ],
      rep_range: null,
    },
  ],
  personal_records: [
    {
      exercise_id: 1,
      exercise_name: 'Press banca con barra',
      muscle_group: 'chest',
      sessions: 14,
      best_e1rm_kg: 83.3,
      best_e1rm_on: '2026-08-28',
      max_weight_kg: 67.5,
      max_weight_on: '2026-09-15',
    },
    {
      exercise_id: 11,
      exercise_name: 'Sentadilla con barra',
      muscle_group: 'quads',
      sessions: 11,
      best_e1rm_kg: 101.3,
      best_e1rm_on: '2026-07-29',
      max_weight_kg: 80,
      max_weight_on: '2026-07-01',
    },
  ],
  weekly_volume: [
    ...EMPTY_WEEKS,
    {
      week_start: '2026-09-14',
      muscles: [
        { muscle_group: 'chest', hard_sets: 6, volume_kg: 2400 },
        { muscle_group: 'quads', hard_sets: 7, volume_kg: 5000 },
      ],
    },
  ],
  volume_advice: [
    {
      muscle_group: 'hamstrings',
      average_hard_sets: 3.5,
      status: 'low',
      weeks: 4,
      min_hard_sets: 10,
      max_hard_sets: 20,
    },
  ],
  week_sets: weekSets({ chest: 6, triceps: 3, quads: 7, glutes: 3.5 }),
  week_overload: [],
  body_weight: {
    entries: [
      { measured_on: '2026-09-14', weight_kg: 79.9, trend_kg: 80.1 },
      { measured_on: '2026-09-15', weight_kg: 79.7, trend_kg: 80.03 },
    ],
    weekly_change_kg: -0.24,
  },
}

function sessions(
  exerciseId: number,
  name: string,
  count: number,
  forecast: ExerciseProgress['forecast'] = null,
): ExerciseProgress {
  return {
    forecast,
    exercise_id: exerciseId,
    exercise_name: name,
    sessions: Array.from({ length: count }, (_, index) => ({
      workout_id: index + 1,
      performed_on: `2026-09-${String(index + 1).padStart(2, '0')}`,
      best_e1rm_kg: 80 + index,
      top_weight_kg: 60 + index,
      working_sets: 3,
      total_reps: 24,
      volume_kg: 1440,
    })),
  }
}

describe('Progress', () => {
  it('opens on the next-session recommendations, grouped by action', async () => {
    mockApi({ 'GET /auth/me': { body: USER }, 'GET /progress/overview': { body: OVERVIEW } })
    const { user } = renderRoute('/progreso')

    const increase = (await screen.findByRole('heading', { name: /Sube el peso/ })).closest('section')
    expect(increase).not.toBeNull()
    expect(within(increase!).getByText('Sentadilla con barra')).toBeInTheDocument()
    expect(within(increase!).getByText('4 × 6 · 80 kg')).toBeInTheDocument()

    const deload = screen.getByRole('heading', { name: /Descarga/ }).closest('section')
    expect(
      within(deload!).getByText(/122,5×14 · 132,5×12 · 142,5×9 · objetivo 120×12 · 130×10 · 140×8/),
    ).toBeInTheDocument()
    expect(within(deload!).getByText('110×12 · 117,5×10 · 127,5×8')).toBeInTheDocument()
    // Each suggestion says why.
    expect(
      within(increase!).getByText('Completaste todas las series objetivo con RIR 2 o más: sube 5 kg.'),
    ).toBeInTheDocument()
    expect(within(deload!).getByText(/no mejora en las últimas sesiones/)).toBeInTheDocument()
    // Closed, a row says only what to do next; a tap opens the last session and the reason.
    const squat = within(increase!).getByText('Sentadilla con barra').closest('details')
    expect(squat).not.toHaveAttribute('open')
    await user.click(within(increase!).getByText('Sentadilla con barra'))
    expect(squat).toHaveAttribute('open')

    const volume = screen.getByRole('region', { name: 'Volumen semanal' })
    expect(within(volume).getByText('Isquiotibiales')).toBeInTheDocument()
    expect(within(volume).getByText(/Lo recomendado son 10–20 series duras/)).toBeInTheDocument()
    expect(
      within(volume).getByText('3,5 series duras por semana: añade algunas en tus rutinas.'),
    ).toBeInTheDocument()
  })

  it('charts the progress of the chosen exercise', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /progress/overview': { body: OVERVIEW },
      'GET /progress/exercises/1': {
        body: sessions(1, 'Press banca con barra', 14, {
          trend: 'rising',
          weekly_change: 0.012,
          from_date: '2026-09-14',
          from_kg: 93,
          on: '2026-10-16',
          expected_kg: 98.4,
          low_kg: 97.1,
          high_kg: 99.6,
        }),
      },
      'GET /progress/exercises/11': { body: sessions(11, 'Sentadilla con barra', 1) },
    })
    const { user, router } = renderRoute('/progreso')

    await user.click(await screen.findByRole('tab', { name: 'Ejercicios' }))
    expect(router.state.location.search).toBe('?vista=ejercicios')
    expect(screen.getByLabelText('Ejercicio')).toHaveDisplayValue('Press banca con barra')
    expect(await screen.findByText('Gráfica de 14 sesiones')).toBeInTheDocument()
    expect(screen.getByText('83,3 kg')).toBeInTheDocument()
    expect(screen.getByText('En un mes: ~98 kg de e1RM')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Ejercicio'), 'Sentadilla con barra')
    expect(
      await screen.findByText('Con dos sesiones de este ejercicio verás su gráfica.'),
    ).toBeInTheDocument()
    expect(screen.getByText('101,3 kg')).toBeInTheDocument()
    // One session: no trend to tell.
    expect(screen.queryByText(/En un mes/)).not.toBeInTheDocument()
  })

  it('opens the tab from the URL and shows volume and body weight', async () => {
    mockApi({ 'GET /auth/me': { body: USER }, 'GET /progress/overview': { body: OVERVIEW } })
    const { user } = renderRoute('/progreso?vista=volumen')

    expect(await screen.findByText('Volumen: quads, chest')).toBeInTheDocument()
    // This week's count is the body's alone: no second table with other numbers.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    // The body: tapping a muscle tells how far it is from the week's target.
    expect(
      screen.getByRole('img', { name: /^Series de esta semana\. Pecho: 6 de 10 series esta semana/ }),
    ).toBeInTheDocument()
    await user.click(document.querySelector('[data-muscle="chest"]')!)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Pecho: 6 de 10 series esta semana. Te faltan 4 series.',
    )

    await user.click(screen.getByRole('tab', { name: 'Peso' }))
    expect(await screen.findByText('Gráfica de 2 pesajes')).toBeInTheDocument()
    expect(screen.getByText('79,7 kg')).toBeInTheDocument()
    expect(screen.getByText('-0,24 kg')).toBeInTheDocument()
  })

  it('explains what to do when there is no data yet', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /progress/overview': {
        body: {
          activity: {
            workouts_total: 0,
            workouts_last_7_days: 0,
            workouts_last_28_days: 0,
            last_workout_on: null,
          },
          recommendations: [],
          personal_records: [],
          weekly_volume: EMPTY_WEEKS,
          volume_advice: [],
          week_sets: weekSets(),
          week_overload: [],
          body_weight: { entries: [], weekly_change_kg: null },
        } satisfies ProgressOverview,
      },
    })
    const { user } = renderRoute('/progreso')

    expect(await screen.findByText(/Registra tu primer entreno/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Peso' }))
    expect(within(screen.getByRole('tabpanel')).getByRole('link', { name: 'Medidas' })).toHaveAttribute(
      'href',
      '/medidas',
    )
  })

  it('does not ask for a first workout after a break of more than four weeks', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /progress/overview': {
        body: {
          ...OVERVIEW,
          activity: { ...OVERVIEW.activity, workouts_last_7_days: 0, workouts_last_28_days: 0 },
          recommendations: [],
        } satisfies ProgressOverview,
      },
    })
    renderRoute('/progreso')

    expect(await screen.findByText(/No has entrenado en las últimas 4 semanas/)).toBeInTheDocument()
    expect(screen.queryByText(/Registra tu primer entreno/)).not.toBeInTheDocument()
  })

  it('lists the latest strength milestones above the exercises, the rest one tap away', async () => {
    const milestone = (
      exercise_name: string,
      kind: Milestone['kind'],
      value_kg: number,
      achieved_on: string,
    ) => ({
      exercise_id: 1,
      exercise_name,
      kind,
      value_kg,
      achieved_on,
      workout_id: 1,
    })
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /progress/overview': { body: OVERVIEW },
      'GET /progress/milestones': {
        body: [
          milestone('Press banca con barra', 'weight', 100, '2026-09-15'),
          milestone('Press banca con barra', 'gain', 20, '2026-09-15'),
          milestone('Curl con mancuernas', 'gain', 5, '2026-09-08'),
          milestone('Sentadilla con barra', 'weight', 80, '2026-09-01'),
        ] satisfies Milestone[],
      },
    })
    const { user } = renderRoute('/progreso?vista=ejercicios')

    const card = await screen.findByRole('region', { name: 'Hitos' })
    const items = () =>
      within(card)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    expect(items()).toEqual([
      expect.stringMatching(/^Primer 100 kgPress banca con barra · /),
      expect.stringMatching(/^\+20 kg desde el inicioPress banca con barra · /),
      expect.stringMatching(/^\+5 kg desde el inicioCurl con mancuernas · /),
    ])

    await user.click(within(card).getByRole('button', { name: 'Ver todos (4)' }))
    expect(items()).toHaveLength(4)
    expect(within(card).getByRole('button', { name: 'Ver menos' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('says how a milestone is earned while there is none', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /progress/overview': { body: OVERVIEW },
      'GET /progress/milestones': { body: [] },
    })
    renderRoute('/progreso?vista=ejercicios')

    expect(
      await screen.findByText(/Aún no hay hitos\. Llegan al subir a un peso redondo/),
    ).toBeInTheDocument()
  })

  it('summarizes the next session on the home page', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /progress/overview': { body: OVERVIEW },
      'GET /workouts?limit=5': { body: [] },
      'GET /routines': { body: [] },
    })
    renderRoute('/')

    const link = await screen.findByRole('link', { name: /Próxima sesión/ })
    // One fact per line, so a phone never strands half of a sentence.
    expect(within(link).getByText('1 ejercicio listo para subir peso')).toBeInTheDocument()
    expect(within(link).getByText('1 descarga')).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/progreso')
  })
})

describe('Calendar', () => {
  // The current month, as the calendar opens on it.
  const month = monthOf(localDate(new Date()))
  const [year, monthNumber] = month.split('-').map(Number) as [number, number]
  const at = (day: number) => new Date(year, monthNumber - 1, day, 18).toISOString()
  const sets = (working: number, warmups = 0): Workout['sets'] =>
    Array.from({ length: working + warmups }, (_, index) => ({
      id: index + 1,
      exercise_id: 11 + (index % 2),
      set_number: index + 1,
      reps: 8,
      weight_kg: 60,
      rpe: null,
      is_warmup: index < warmups,
    }))
  const workout = (id: number, day: number, working: number, warmups = 0): Workout => ({
    id,
    routine_id: id === 1 ? 7 : null,
    started_at: at(day),
    ended_at: null,
    notes: null,
    sets: sets(working, warmups),
  })

  it('shades the days trained by their working sets, and lists a day tapped', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /progress/overview': { body: OVERVIEW },
      'GET /routines': {
        body: [{ id: 7, name: 'Pierna', description: null, created_at: at(1), exercises: [] }],
      },
      [`GET /workouts?start=${month}&end=${addMonths(month, 1)}&limit=100`]: {
        body: [workout(2, 3, 25), workout(1, 2, 12, 2)],
      },
      [`GET /workouts?start=${addMonths(month, -1)}&end=${month}&limit=100`]: { body: [] },
    })
    const { user } = renderRoute('/progreso?vista=calendario')

    expect(await screen.findByRole('heading', { name: formatMonth(month) })).toBeInTheDocument()
    expect(await screen.findByText('2 días entrenados')).toBeInTheDocument()
    const day = (number: number) => `${month.slice(0, 8)}${String(number).padStart(2, '0')}`
    // Warm-ups do not count: 12 working sets is the second shade, 25 the third.
    const second = screen.getByRole('button', { name: `${formatLongDay(day(2))}, 1 entreno, 12 series` })
    expect(second).toHaveClass('bg-primary/40')
    expect(
      screen.getByRole('button', { name: `${formatLongDay(day(3))}, 1 entreno, 25 series` }),
    ).toHaveClass('bg-primary/70')
    expect(screen.getByRole('button', { name: `${formatLongDay(day(4))}, sin entrenos` })).toBeDisabled()

    await user.click(second)
    const list = screen.getByRole('region', { name: formatLongDay(day(2)) })
    expect(within(list).getByText('Pierna')).toBeInTheDocument()
    expect(within(list).getByText('2 ejercicios · 14 series')).toBeInTheDocument()

    // No months ahead of this one; back one, and it is empty.
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(
      await screen.findByRole('heading', { name: formatMonth(addMonths(month, -1)) }),
    ).toBeInTheDocument()
    expect(await screen.findByText('0 días entrenados')).toBeInTheDocument()
  })

  it('edits a saved workout from the day tapped: reps changed, a set removed, notes added', async () => {
    const saved = workout(1, 2, 3)
    const calls = mockApi({
      'GET /auth/me': { body: USER },
      'GET /progress/overview': { body: OVERVIEW },
      'GET /routines': { body: [] },
      'GET /exercises': {
        body: [
          { id: 11, name: 'Sentadilla' },
          { id: 12, name: 'Prensa' },
        ],
      },
      [`GET /workouts?start=${month}&end=${addMonths(month, 1)}&limit=100`]: { body: [saved] },
      'PUT /workouts/1': ({ body }) => ({ body: { ...saved, ...(body as object) } }),
    })
    const { user } = renderRoute('/progreso?vista=calendario')

    const day = `${month.slice(0, 8)}02`
    await user.click(
      await screen.findByRole('button', { name: `${formatLongDay(day)}, 1 entreno, 3 series` }),
    )
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const sheet = await screen.findByRole('dialog', { name: 'Editar entreno' })
    // Nothing changed yet, so nothing to save.
    expect(within(sheet).getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()

    const reps = await within(sheet).findByRole('textbox', { name: 'Sentadilla, serie 2: reps' })
    await user.clear(reps)
    await user.type(reps, '10')
    await user.click(within(sheet).getByRole('button', { name: 'Quitar Prensa, serie 1' }))
    await user.type(within(sheet).getByRole('textbox', { name: 'Notas' }), 'Rodilla bien')
    await user.click(within(sheet).getByRole('button', { name: 'Guardar cambios' }))

    const put = await vi.waitFor(() => {
      const call = calls.find((item) => item.method === 'PUT')
      expect(call).toBeDefined()
      return call!
    })
    expect(put.path).toBe('/workouts/1')
    expect(put.body).toMatchObject({
      notes: 'Rodilla bien',
      sets: [
        { exercise_id: 11, set_number: 1, reps: 8 },
        { exercise_id: 11, set_number: 2, reps: 10 },
      ],
    })
  })
})
