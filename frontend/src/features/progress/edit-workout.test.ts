import { describe, expect, it } from 'vitest'
import type { Workout } from '@/lib/types'
import { isValidReps, isValidWeight, toEditableSets, toEditedPayload } from './edit-workout'

const set = (id: number, exercise_id: number, set_number: number, weight_kg = 60, is_warmup = false) => ({
  id,
  exercise_id,
  set_number,
  reps: 8,
  weight_kg,
  rpe: 8,
  is_warmup,
})

const workout: Workout = {
  id: 7,
  routine_id: 3,
  started_at: '2026-11-18T18:00:00+01:00',
  ended_at: '2026-11-18T19:00:00+01:00',
  notes: 'Bien',
  // Out of order on purpose: the API does not promise any.
  sets: [set(4, 2, 1, 20), set(2, 1, 2, 37.5), set(1, 1, 1, 20, true), set(5, 2, 2, 22.5)],
}

describe('editing a saved workout', () => {
  it('lists sets by exercise in the order they were done, weights in Spanish decimals', () => {
    const rows = toEditableSets(workout)
    expect(rows.map((row) => row.key)).toEqual([4, 5, 1, 2])
    expect(rows[3]).toMatchObject({ weight: '37,5', reps: '8', rpe: 8, is_warmup: false })
  })

  it('numbers sets again per exercise, so a removed set leaves no gap', () => {
    const rows = toEditableSets(workout).filter((row) => row.key !== 4)
    rows[0] = { ...rows[0]!, weight: '25', reps: '10' }
    const payload = toEditedPayload(workout, rows, '  ')
    expect(payload.sets.map((item) => [item.exercise_id, item.set_number, item.weight_kg])).toEqual([
      [2, 1, 25],
      [1, 1, 20],
      [1, 2, 37.5],
    ])
    expect(payload.sets[0]?.reps).toBe(10)
    expect(payload.sets[1]?.is_warmup).toBe(true)
    // Blank notes are saved as none; the rest of the workout stays as it was.
    expect(payload).toMatchObject({ notes: null, routine_id: 3, started_at: workout.started_at })
  })

  it('checks typed values against what the API takes', () => {
    expect(isValidWeight('37,5')).toBe(true)
    expect(isValidWeight('')).toBe(false)
    expect(isValidWeight('1001')).toBe(false)
    expect(isValidReps('8')).toBe(true)
    expect(isValidReps('8,5')).toBe(false)
    expect(isValidReps('-1')).toBe(false)
  })
})
