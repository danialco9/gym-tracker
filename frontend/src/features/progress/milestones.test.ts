import { describe, expect, it } from 'vitest'
import type { Milestone } from '@/lib/types'
import { celebration } from './milestones'

const milestone = (kind: Milestone['kind'], value_kg: number, workout_id: number): Milestone => ({
  exercise_id: 1,
  exercise_name: 'Press banca',
  kind,
  value_kg,
  achieved_on: '2026-11-24',
  workout_id,
})

describe('celebration', () => {
  it('says nothing when the workout earned no milestone', () => {
    expect(celebration([milestone('weight', 100, 7)], 8)).toBeNull()
  })

  it('tells a single milestone in one sentence', () => {
    expect(celebration([milestone('weight', 100, 8)], 8)).toEqual({ title: '¡Primer 100 kg en Press banca!' })
  })

  it('counts several and names each exercise once, leaving out those of other workouts', () => {
    const squat = { ...milestone('weight', 120, 8), exercise_id: 2, exercise_name: 'Sentadilla' }
    expect(
      celebration(
        [milestone('weight', 100, 8), milestone('gain', 20, 8), squat, milestone('weight', 80, 3)],
        8,
      ),
    ).toEqual({
      title: '¡3 hitos nuevos!',
      description: 'Press banca: primer 100 kg y +20 kg desde el inicio · Sentadilla: primer 120 kg',
    })
  })
})
