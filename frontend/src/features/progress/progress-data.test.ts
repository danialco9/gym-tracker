import { describe, expect, it } from 'vitest'
import type { MuscleGroup, Recommendation, WeeklyVolume } from '@/lib/types'
import { buildVolume, explainRecommendation, explainVolume, groupRecommendations } from './progress-data'

function week(weekStart: string, sets: Partial<Record<MuscleGroup, number>>): WeeklyVolume {
  return {
    week_start: weekStart,
    muscles: Object.entries(sets).map(([muscle, hardSets]) => ({
      muscle_group: muscle as MuscleGroup,
      hard_sets: hardSets,
      volume_kg: hardSets * 500,
    })),
  }
}

function recommendation(
  name: string,
  action: Recommendation['action'],
  changes: Partial<Recommendation> = {},
): Recommendation {
  return {
    exercise_id: name.length,
    exercise_name: name,
    action,
    reason: 'targets_hit',
    increment_kg: 2.5,
    last_performed_on: '2026-09-15',
    last_sets: [{ reps: 8, weight_kg: 60, rpe: 8 }],
    target_sets: [{ reps: 8, weight_kg: null }],
    suggested_sets: [{ reps: 8, weight_kg: 62.5 }],
    rep_range: null,
    ...changes,
  }
}

describe('progress data', () => {
  it('groups recommendations by action in a fixed order', () => {
    const groups = groupRecommendations([
      recommendation('Sentadilla', 'deload'),
      recommendation('Press banca', 'increase_load'),
      recommendation('Jalón', 'increase_load'),
    ])

    expect(groups.map((group) => [group.action, group.items.map((item) => item.exercise_name)])).toEqual([
      ['increase_load', ['Jalón', 'Press banca']],
      ['deload', ['Sentadilla']],
    ])
  })

  it('explains each recommendation with the numbers of the last session', () => {
    expect(explainRecommendation(recommendation('Press banca', 'increase_load'))).toBe(
      'Completaste todas las series objetivo con RIR 2 o más: sube 2,5 kg.',
    )
    expect(
      explainRecommendation(
        recommendation('Press banca', 'hold', {
          reason: 'targets_hit_hard',
          last_sets: [{ reps: 8, weight_kg: 60, rpe: 9.5 }],
        }),
      ),
    ).toBe('Completaste el objetivo, pero llegaste a RIR 0,5: repite el peso hasta que cueste menos.')
    expect(
      explainRecommendation(
        recommendation('Jalón', 'increase_reps', {
          reason: 'targets_missed',
          target_sets: [
            { reps: 10, weight_kg: null },
            { reps: 10, weight_kg: null },
          ],
          last_sets: [
            { reps: 10, weight_kg: 50, rpe: 8 },
            { reps: 8, weight_kg: 50, rpe: 9 },
          ],
        }),
      ),
    ).toBe('En la serie 2 hiciste 8 de 10 repeticiones: mantén el peso hasta completarlas.')
    expect(
      explainRecommendation(
        recommendation('Elevaciones laterales', 'increase_reps', {
          reason: 'jump_too_big',
          increment_kg: 2,
          last_sets: [{ reps: 12, weight_kg: 6, rpe: 7 }],
        }),
      ),
    ).toBe('Subir 2 kg sería un salto grande (un 33 % más): primero suma una repetición por serie.')
  })

  it('explains the steps inside the rep range of the goal', () => {
    const inRange = (reason: Recommendation['reason']) =>
      explainRecommendation(
        recommendation('Press banca', 'increase_reps', { reason, rep_range: { min: 8, max: 12 } }),
      )

    expect(inRange('range_top')).toBe(
      'Llegaste a 12 repeticiones en todas las series: sube el peso y vuelve a 8.',
    )
    expect(inRange('within_range')).toBe(
      'Vas dentro del rango de 8–12: mismo peso y una repetición más por serie hasta llegar a 12.',
    )
    expect(inRange('below_range')).toBe(
      'Aún no llegas a 8 repeticiones en todas las series: mantén el peso hasta conseguirlo.',
    )
  })

  it('explains the weekly volume advice', () => {
    const advice = { muscle_group: 'quads', weeks: 4, min_hard_sets: 10, max_hard_sets: 20 } as const
    expect(explainVolume({ ...advice, average_hard_sets: 24, status: 'high' })).toBe(
      '24 series duras por semana: quita algunas, pasado 20 suman sobre todo fatiga.',
    )
    expect(explainVolume({ ...advice, average_hard_sets: 1, status: 'low' })).toBe(
      '1 serie dura por semana: añade algunas en tus rutinas.',
    )
  })

  it('keeps the busiest muscles as series and folds the rest into "other"', () => {
    const { series, rows } = buildVolume([
      week('2026-09-07', { chest: 9, back: 8, quads: 6, hamstrings: 4, shoulders: 3, biceps: 2, calves: 1 }),
      week('2026-09-14', { chest: 3, triceps: 2 }),
    ])

    expect(series).toEqual(['chest', 'back', 'quads', 'hamstrings', 'shoulders', 'other'])
    expect(rows).toEqual([
      { week_start: '2026-09-07', chest: 9, back: 8, quads: 6, hamstrings: 4, shoulders: 3, other: 3 },
      { week_start: '2026-09-14', chest: 3, other: 2 },
    ])
  })

  it('has no series without training', () => {
    expect(buildVolume([week('2026-09-14', {})])).toEqual({
      series: [],
      rows: [{ week_start: '2026-09-14' }],
    })
  })
})
