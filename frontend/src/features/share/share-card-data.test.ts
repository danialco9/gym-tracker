import { describe, expect, it } from 'vitest'
import type { PersonalRecord, Workout, WorkoutSet } from '@/lib/types'
import { shareCardData } from './share-card-data'

let nextId = 1
const set = (exercise_id: number, weight_kg: number, reps: number, is_warmup = false): WorkoutSet => ({
  id: nextId++,
  exercise_id,
  set_number: 1,
  reps,
  weight_kg,
  rpe: null,
  is_warmup,
})

const workout: Workout = {
  id: 7,
  routine_id: 1,
  started_at: '2026-11-24T18:00:00',
  ended_at: '2026-11-24T19:05:00',
  notes: null,
  sets: [set(1, 40, 10, true), set(1, 100, 5), set(1, 100, 6), set(2, 60, 8), set(3, 30, 12), set(4, 0, 15)],
}

const names = new Map([
  [1, 'Press banca'],
  [2, 'Remo con barra'],
  [3, 'Curl de bíceps'],
  [4, 'Dominadas'],
])

const record = (exercise_id: number, best_e1rm_on: string, max_weight_on: string): PersonalRecord => ({
  exercise_id,
  exercise_name: '',
  muscle_group: 'chest',
  sessions: 3,
  best_e1rm_kg: 100,
  best_e1rm_on,
  max_weight_kg: 100,
  max_weight_on,
})

describe('shareCardData', () => {
  it('sums the working sets and leaves the warm-ups out', () => {
    const data = shareCardData(workout, 'Torso', names, [])
    expect(data.title).toBe('Torso')
    expect(data.duration).toBe('1 h 5 min')
    expect(data.workingSets).toBe(5)
    // 500 + 600 + 480 + 360 + 0
    expect(data.volume).toBe('1940 kg')
  })

  it('lists the three heaviest exercises with their heaviest set, more reps breaking a tie', () => {
    const data = shareCardData(workout, 'Torso', names, [])
    expect(data.topExercises).toEqual([
      { name: 'Press banca', bestSet: '100 kg × 6' },
      { name: 'Remo con barra', bestSet: '60 kg × 8' },
      { name: 'Curl de bíceps', bestSet: '30 kg × 12' },
    ])
  })

  it('shows bodyweight sets as reps alone', () => {
    const bodyweight = { ...workout, sets: [set(4, 0, 15)] }
    expect(shareCardData(bodyweight, 'Libre', names, []).topExercises).toEqual([
      { name: 'Dominadas', bestSet: '15 reps' },
    ])
  })

  it('counts the records set on the workout day, for exercises done in it', () => {
    const records = [
      record(1, '2026-11-24', '2026-10-01'),
      record(2, '2026-10-01', '2026-11-24'),
      record(3, '2026-10-01', '2026-10-01'),
      record(9, '2026-11-24', '2026-11-24'),
    ]
    expect(shareCardData(workout, 'Torso', names, records).records).toBe(2)
  })
})
