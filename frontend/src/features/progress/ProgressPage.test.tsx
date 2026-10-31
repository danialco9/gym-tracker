import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExerciseProgress, ProgressOverview, User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'

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
  show_in_ranking: true,
  created_at: '2026-09-15T10:00:00Z',
}

const EMPTY_WEEKS = ['2026-08-31', '2026-09-07'].map((weekStart) => ({ week_start: weekStart, muscles: [] }))

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
  body_weight: {
    entries: [
      { measured_on: '2026-09-14', weight_kg: 79.9, trend_kg: 80.1 },
      { measured_on: '2026-09-15', weight_kg: 79.7, trend_kg: 80.03 },
    ],
    weekly_change_kg: -0.24,
  },
}

function sessions(exerciseId: number, name: string, count: number): ExerciseProgress {
  return {
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
  it('shows activity and the next-session recommendations grouped by action', async () => {
    mockApi({ 'GET /auth/me': { body: USER }, 'GET /progress/overview': { body: OVERVIEW } })
    renderRoute('/progreso')

    expect(await screen.findByText('Últimos 7 días')).toBeInTheDocument()
    expect(screen.getByText('Peso -0,24 kg/sem')).toBeInTheDocument()

    const increase = screen.getByRole('heading', { name: /Sube el peso/ }).closest('section')
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
      within(increase!).getByText('Completaste todas las series objetivo con RPE 8 como máximo: sube 5 kg.'),
    ).toBeInTheDocument()
    expect(within(deload!).getByText(/no mejora en las últimas sesiones/)).toBeInTheDocument()

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
      'GET /progress/exercises/1': { body: sessions(1, 'Press banca con barra', 14) },
      'GET /progress/exercises/11': { body: sessions(11, 'Sentadilla con barra', 1) },
    })
    const { user, router } = renderRoute('/progreso')

    await user.click(await screen.findByRole('tab', { name: 'Ejercicios' }))
    expect(router.state.location.search).toBe('?vista=ejercicios')
    expect(screen.getByLabelText('Ejercicio')).toHaveDisplayValue('Press banca con barra')
    expect(await screen.findByText('Gráfica de 14 sesiones')).toBeInTheDocument()
    expect(screen.getByText('83,3 kg')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Ejercicio'), 'Sentadilla con barra')
    expect(
      await screen.findByText('Con dos sesiones de este ejercicio verás su gráfica.'),
    ).toBeInTheDocument()
    expect(screen.getByText('101,3 kg')).toBeInTheDocument()
  })

  it('opens the tab from the URL and shows volume and body weight', async () => {
    mockApi({ 'GET /auth/me': { body: USER }, 'GET /progress/overview': { body: OVERVIEW } })
    const { user } = renderRoute('/progreso?vista=volumen')

    expect(await screen.findByText('Volumen: quads, chest')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: /Series por músculo/ })
    expect(within(table).getByRole('row', { name: /Cuádriceps 7 0/ })).toBeInTheDocument()

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

  it('summarizes the next session on the home page', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /progress/overview': { body: OVERVIEW },
      'GET /workouts?limit=5': { body: [] },
      'GET /routines': { body: [] },
    })
    renderRoute('/')

    const link = await screen.findByRole('link', { name: /Próxima sesión/ })
    expect(link).toHaveTextContent('1 ejercicio listo para subir peso · 1 descarga')
    expect(link).toHaveAttribute('href', '/progreso')
  })
})
