import type { Workout, WorkoutIn } from '@/lib/types'

/** A saved set as the edit sheet holds it: weight and reps as typed text, so "37," can wait for the 5. */
export interface EditableSet {
  /** The saved set's id, to key the row. */
  key: number
  exercise_id: number
  is_warmup: boolean
  weight: string
  reps: string
  rpe: number | null
}

const toText = (value: number) => String(value).replace('.', ',')

/** The workout's sets in the order they were done: by exercise as first met, then by set number. */
export function toEditableSets(workout: Workout): EditableSet[] {
  const order = [...new Set(workout.sets.map((set) => set.exercise_id))]
  return workout.sets
    .toSorted(
      (a, b) => order.indexOf(a.exercise_id) - order.indexOf(b.exercise_id) || a.set_number - b.set_number,
    )
    .map((set) => ({
      key: set.id,
      exercise_id: set.exercise_id,
      is_warmup: set.is_warmup,
      weight: toText(set.weight_kg),
      reps: String(set.reps),
      rpe: set.rpe,
    }))
}

const parse = (text: string) => (text.trim() === '' ? Number.NaN : Number(text.trim().replace(',', '.')))

/** Whether the typed weight is one the API takes: 0 to 1000 kg. */
export const isValidWeight = (text: string) => {
  const value = parse(text)
  return value >= 0 && value <= 1000
}

/** Whether the typed reps are a whole number from 0 to 200. */
export const isValidReps = (text: string) => {
  const value = parse(text)
  return Number.isInteger(value) && value >= 0 && value <= 200
}

/**
 * The PUT payload: the workout as saved with the edited sets and notes. Sets are numbered again per
 * exercise, as when the workout was saved, so removing one leaves no gap.
 */
export function toEditedPayload(workout: Workout, sets: readonly EditableSet[], notes: string): WorkoutIn {
  const setNumbers = new Map<number, number>()
  return {
    client_id: null,
    routine_id: workout.routine_id,
    started_at: workout.started_at,
    ended_at: workout.ended_at,
    notes: notes.trim() === '' ? null : notes.trim(),
    sets: sets.map((set) => {
      const setNumber = (setNumbers.get(set.exercise_id) ?? 0) + 1
      setNumbers.set(set.exercise_id, setNumber)
      return {
        exercise_id: set.exercise_id,
        set_number: setNumber,
        reps: parse(set.reps),
        weight_kg: parse(set.weight),
        rpe: set.rpe,
        is_warmup: set.is_warmup,
      }
    }),
  }
}
