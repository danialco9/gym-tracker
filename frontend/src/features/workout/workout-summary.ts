import { formatDuration, plural } from '@/lib/format'
import type { Workout } from '@/lib/types'

/** "1 h 5 min · 4 ejercicios · 16 series". */
export function workoutSummary(workout: Workout): string {
  const exerciseCount = new Set(workout.sets.map((set) => set.exercise_id)).size
  const setCount = workout.sets.length
  return [
    formatDuration(workout.started_at, workout.ended_at),
    `${exerciseCount} ${plural(exerciseCount, 'ejercicio', 'ejercicios')}`,
    `${setCount} ${plural(setCount, 'serie', 'series')}`,
  ]
    .filter(Boolean)
    .join(' · ')
}
