import { describe, expect, it } from 'vitest'
import type { ExerciseForecast, ExerciseSession } from '@/lib/types'
import { dayValue, exerciseChartRows, forecastMessage } from './forecast'

const session = (performed_on: string, best_e1rm_kg: number): ExerciseSession => ({
  workout_id: 1,
  performed_on,
  best_e1rm_kg,
  top_weight_kg: best_e1rm_kg - 10,
  working_sets: 3,
  total_reps: 15,
  volume_kg: 1000,
})

const forecast = (trend: ExerciseForecast['trend'], weekly_change: number): ExerciseForecast => ({
  trend,
  weekly_change,
  from_date: '2026-11-20',
  from_kg: 100.4,
  on: '2026-12-22',
  expected_kg: 104.6,
  low_kg: 103.2,
  high_kg: 106.1,
})

describe('exercise forecast', () => {
  it('draws the trend over the last eight weeks of sessions and on to a month ahead', () => {
    // The first session is older than eight weeks: the trend starts at the second.
    const sessions = [session('2026-09-01', 90), session('2026-10-02', 98), session('2026-11-20', 101)]

    expect(exerciseChartRows(sessions, null)).toHaveLength(3)
    const rows = exerciseChartRows(sessions, forecast('rising', 0.01))
    // 4,2 kg in the 32 days ahead is 0,13 kg a day, so 49 days earlier it was 6,4 kg lower.
    expect(rows).toEqual([
      { day: dayValue('2026-09-01'), best_e1rm_kg: 90, top_weight_kg: 80 },
      { day: dayValue('2026-10-02'), best_e1rm_kg: 98, top_weight_kg: 88, forecast_kg: 94 },
      { day: dayValue('2026-11-20'), best_e1rm_kg: 101, top_weight_kg: 91 },
      { day: dayValue('2026-12-22'), forecast_kg: 104.6 },
    ])
  })

  it('places days by date, a week apart being seven days', () => {
    expect(dayValue('2026-11-20') - dayValue('2026-11-13')).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('says where the lift is heading and what to do about it', () => {
    expect(forecastMessage(forecast('rising', 0.0123))).toEqual({
      title: 'En un mes: entre 103 y 106 kg',
      detail: 'Lo que podrías levantar a 1 repetición. Subes un 1,2 % por semana: sigue así.',
    })
    expect(forecastMessage({ ...forecast('rising', 0.01), low_kg: 104.6, high_kg: 105.2 }).title).toBe(
      'En un mes: unos 105 kg',
    )
    expect(forecastMessage(forecast('flat', 0.001)).title).toBe('Se está frenando')
    expect(forecastMessage(forecast('falling', -0.02)).detail).toMatch(/^Bajas un 2 % por semana/)
  })
})
