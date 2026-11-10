import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ProgressOverview, User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'
import { BlockCard } from './BlockCard'

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: 'build_muscle',
  nickname: null,
  sex: null,
  created_at: '2026-09-15T10:00:00Z',
}

describe('Training block card', () => {
  it('says the week of the block and how far the deload is', () => {
    const { rerender } = render(<BlockCard block={{ week: 2, weeks: 5, is_deload: false }} />)
    expect(screen.getByText('Semana 2 de 5 del bloque')).toBeInTheDocument()
    expect(screen.getByText('Descarga en 3 semanas')).toBeInTheDocument()

    rerender(<BlockCard block={{ week: 4, weeks: 5, is_deload: false }} />)
    expect(screen.getByText('Descarga la semana que viene')).toBeInTheDocument()
  })

  it('turns into the reminder to train lighter in the deload week', () => {
    render(<BlockCard block={{ week: 5, weeks: 5, is_deload: true }} />)

    expect(screen.getByText('Semana de descarga')).toBeInTheDocument()
    expect(screen.getByText(/menos series y RIR 3–4/)).toBeInTheDocument()
  })

  it('shows on the home screen only for someone training in blocks', async () => {
    mockApi({
      'GET /auth/me': { body: { ...USER, block_weeks: 4, block: { week: 1, weeks: 4, is_deload: false } } },
    })
    renderRoute('/')
    expect(await screen.findByRole('region', { name: 'Tu bloque' })).toBeInTheDocument()
  })

  it('takes the place of beating last time in the deload week', async () => {
    const overview: ProgressOverview = {
      activity: {
        workouts_total: 3,
        workouts_last_7_days: 1,
        workouts_last_28_days: 3,
        last_workout_on: null,
      },
      recommendations: [
        {
          exercise_id: 6,
          exercise_name: 'Press banca con barra',
          action: 'hold',
          reason: 'deload_week',
          increment_kg: 2.5,
          last_performed_on: '2026-11-02',
          last_sets: [{ reps: 8, weight_kg: 80, rpe: 8 }],
          target_sets: [],
          suggested_sets: [{ reps: 8, weight_kg: 80 }],
          rep_range: null,
        },
      ],
      personal_records: [],
      weekly_volume: [],
      week_sets: [],
      week_overload: [
        {
          exercise_id: 6,
          exercise_name: 'Press banca con barra',
          verdict: 'below',
          current: { weight_kg: 80, reps: 6 },
          previous: { weight_kg: 80, reps: 8 },
        },
      ],
      volume_advice: [],
      body_weight: { entries: [], weekly_change_kg: null },
    }
    const deload = { ...USER, block_weeks: 4, block: { week: 4, weeks: 4, is_deload: true } }
    mockApi({ 'GET /auth/me': { body: deload }, 'GET /progress/overview': { body: overview } })
    renderRoute('/')

    expect(await screen.findByText('Semana de descarga')).toBeInTheDocument()
    // The overview is in (the next session comes from it), and the overload card is still left out.
    expect(await screen.findByText('Próxima sesión')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Sobrecarga esta semana' })).not.toBeInTheDocument()
  })

  it('stays out of the way without blocks', async () => {
    mockApi({ 'GET /auth/me': { body: USER } })
    renderRoute('/')
    expect(await screen.findByRole('heading', { name: /^Hola/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Tu bloque' })).not.toBeInTheDocument()
  })
})
